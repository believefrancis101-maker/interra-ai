// src/lib/call-model.ts
// The ONLY place that talks to a model provider. Everything the worker needs from a provider
// goes through makeCaller(); the policy in process-job.ts never sees an SDK.
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { config } from "../config";
import { ModelError, type Msg, type Reply } from "../worker/process-job";

type Role = "analyst" | "prep";

export type ModelInput = {
  system: string;
  // JSON Schema generated from the Zod schema (z.toJSONSchema). Gemini enforces it natively;
  // DeepSeek only offers JSON mode, so the schema is appended to the system prompt instead.
  // Either way, OUR validation (makeValidator) is what decides whether the output is accepted.
  jsonSchema?: object;
  // Role 1 only. Re-attached to the first user message on EVERY call, because the model is stateless
  // and a repair call must still see the document.
  file?: { kind: "text"; text: string } | { kind: "binary"; mimeType: string; data: Buffer };
};

// Minimal shapes of the two SDK clients, so tests can inject fakes.
export type GeminiLike = { models: { generateContent(args: any): Promise<any> } };
export type OpenAILike = { chat: { completions: { create(args: any, opts?: any): Promise<any> } } };
export type Deps = { gemini: () => GeminiLike; deepseek: () => OpenAILike };

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new ModelError("PROVIDER_ERROR", `${name} is not set`); // deployment fault, visible on the job
  return v;
};

export const realDeps: Deps = {
  gemini: () => new GoogleGenAI({
    apiKey: need("GEMINI_API_KEY"),
    // The SDK may retry on its own. That would hide provider calls from `attempts` and bypass our
    // 429 policy, so retries are switched off here ("0 or 1 means no retries").
    httpOptions: { retryOptions: { attempts: 1 } },
  }),
  deepseek: () => new OpenAI({
    apiKey: need("DEEPSEEK_API_KEY"),
    baseURL: config.roles.prep.baseUrl,
    maxRetries: 0, // SDK default is 2 silent retries; our policy owns retrying
  }),
};

// ---------- timeout + error classification ----------

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new ModelError("TIMEOUT", `No response within ${ms}ms`));
    }, ms);
  });
  const work = run(ctrl.signal);
  work.catch(() => {}); // if the timeout wins, a later rejection must not become an unhandled rejection
  try { return await Promise.race([work, timeout]); }
  finally { clearTimeout(timer); }
}

function classify(e: unknown): ModelError {
  if (e instanceof ModelError) return e;
  const status = typeof (e as any)?.status === "number" ? (e as any).status : undefined;
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (status === 429) return new ModelError("RATE_LIMITED", msg.slice(0, 500));
  return new ModelError("PROVIDER_ERROR", `${status ? `HTTP ${status} ` : ""}${msg}`.slice(0, 500));
}

// ---------- the caller ----------

// A text document is wrapped so the prompt can tell the model it is DATA, not instructions.
const wrapText = (t: string) => `<document>\n${t.replaceAll("</document>", "<\\/document>")}\n</document>`;

export function makeCaller(role: Role, input: ModelInput, deps: Deps = realDeps) {
  if (role === "prep" && input.file) throw new Error("Role 2 never receives the raw file");
  return role === "analyst" ? geminiCaller(input, deps) : deepseekCaller(input, deps);
}

function geminiCaller(input: ModelInput, deps: Deps) {
  const cfg = config.roles.analyst;
  return async (messages: Msg[]): Promise<Reply> => {
    const contents = messages.map((m, i) => {
      const parts: any[] = [];
      if (i === 0 && input.file) {
        parts.push(input.file.kind === "text"
          ? { text: wrapText(input.file.text) }
          : { inlineData: { mimeType: input.file.mimeType, data: input.file.data.toString("base64") } });
      }
      parts.push({ text: m.content });
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });

    try {
      const res = await withTimeout(cfg.timeoutMs, signal => deps.gemini().models.generateContent({
        model: cfg.model,
        contents,
        config: {
          systemInstruction: input.system,
          temperature: cfg.temperature,
          maxOutputTokens: cfg.maxOutputTokens,
          responseMimeType: "application/json",
          ...(input.jsonSchema ? { responseJsonSchema: input.jsonSchema } : {}),
          abortSignal: signal,
        },
      }));
      const u = res?.usageMetadata ?? {};
      return {
        text: res?.text ?? "", // empty/blocked reply -> fails validation -> goes through the repair path
        inputTokens: u.promptTokenCount ?? 0,
        // "thinking" tokens are billed as output but are not in candidatesTokenCount
        outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
      };
    } catch (e) { throw classify(e); }
  };
}

function deepseekCaller(input: ModelInput, deps: Deps) {
  const cfg = config.roles.prep;
  const system = input.jsonSchema
    ? `${input.system}\n\nRespond with a single JSON object (JSON only, no prose) that conforms to this JSON Schema:\n${JSON.stringify(input.jsonSchema)}`
    : input.system;
  return async (messages: Msg[]): Promise<Reply> => {
    try {
      const res = await withTimeout(cfg.timeoutMs, signal => deps.deepseek().chat.completions.create({
        model: cfg.model,
        messages: [{ role: "system", content: system }, ...messages],
        temperature: cfg.temperature,
        max_tokens: cfg.maxOutputTokens,
        response_format: { type: "json_object" },
      }, { signal }));
      return {
        text: res?.choices?.[0]?.message?.content ?? "",
        inputTokens: res?.usage?.prompt_tokens ?? 0,
        outputTokens: res?.usage?.completion_tokens ?? 0,
      };
    } catch (e) { throw classify(e); }
  };
}
