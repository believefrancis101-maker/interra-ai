// src/worker/process-job.ts
// Failure policy: every outcome of a model call maps to ONE defined next step.
import { config } from "../config";
import { prisma } from "../lib/prisma"; // your Prisma client singleton
import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requirementsOk, type Requirements } from "../lib/schemas";

export type ErrorCode =
  | "TIMEOUT" | "RATE_LIMITED" | "PROVIDER_ERROR"
  | "INVALID_OUTPUT" | "NOT_A_JOB_DESCRIPTION" | "STALE";

// Thrown by callModel(): timeout -> TIMEOUT, HTTP 429 -> RATE_LIMITED, anything else -> PROVIDER_ERROR.
export class ModelError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); }
}

export type Msg = { role: "user" | "assistant"; content: string };
export type Reply = { text: string; inputTokens: number; outputTokens: number };
type Validation<T> = { ok: true; data: T } | { ok: false; issues: string };

// A value of type Validated<T> can only come from makeValidator(), i.e. after JSON.parse AND
// schema.safeParse succeeded. markDone() only accepts Validated data, so passing raw model output
// (or any hand-built object) is a COMPILE error. This is a compile-time guard: the runtime
// guarantee is that the brand is applied in exactly one place, immediately after safeParse succeeds.
declare const validatedBrand: unique symbol;
export type Validated<T> = T & { readonly [validatedBrand]: true };

export type Outcome<T> =
  | { ok: true; data: T; raw: string; calls: number; inputTokens: number; outputTokens: number }
  | { ok: false; code: ErrorCode; message: string; raw?: string; calls: number;
      inputTokens: number; outputTokens: number };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""); // tolerate code fences
  return JSON.parse(t);
}

// The ONLY place the Validated brand is applied.
export function makeValidator<S extends z.ZodType>(schema: S) {
  return (text: string): Validation<Validated<z.infer<S>>> => {
    let json: unknown;
    try { json = parseJson(text); }
    catch { return { ok: false, issues: "The response was not valid JSON." }; }

    const r = schema.safeParse(json);
    if (!r.success) {
      const issues = r.error.issues.slice(0, 5)
        .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
      return { ok: false, issues };
    }
    return { ok: true, data: r.data as Validated<z.infer<S>> }; // the single cast, post-safeParse
  };
}

const repairPrompt = (issues: string) =>
  `Your previous reply was rejected for these reasons:\n${issues}\n` +
  `Reply again with ONLY the corrected JSON object. No prose, no code fences.`;

export async function runWithPolicy<T>(args: {
  messages: Msg[];
  call: (messages: Msg[]) => Promise<Reply>;
  validate: (text: string) => Validation<Validated<T>>;
  sleep?: (ms: number) => Promise<void>; // injectable so tests don't wait out real backoffs
}): Promise<Outcome<Validated<T>>> {
  const { maxInvalidResponses: maxInvalid, rateLimited } = config.retry;
  const wait = args.sleep ?? sleep;
  let messages = args.messages;
  let invalidResponses = 0, rlRetries = 0, calls = 0, inTok = 0, outTok = 0;
  let lastRaw: string | undefined, lastIssues = "";

  while (invalidResponses < maxInvalid) { // stops after maxInvalid responses fail validation
    let reply: Reply;
    try {
      calls++;
      reply = await args.call(messages);
    } catch (e) {
      const err = e instanceof ModelError ? e : new ModelError("PROVIDER_ERROR", String(e));
      if (err.code === "RATE_LIMITED" && rlRetries < rateLimited.maxRetries) {
        rlRetries++;
        await wait(rateLimited.backoffMs * rlRetries);   // back off, then try the same request
        continue;                                          // does NOT use the invalid-output budget
      }
      // TIMEOUT / PROVIDER_ERROR / exhausted RATE_LIMITED: no silent retry (it would double the cost).
      return { ok: false, code: err.code, message: err.message, calls, inputTokens: inTok, outputTokens: outTok };
    }

    inTok += reply.inputTokens; outTok += reply.outputTokens; lastRaw = reply.text;
    const v = args.validate(reply.text);
    if (v.ok) return { ok: true, data: v.data, raw: reply.text, calls, inputTokens: inTok, outputTokens: outTok };

    // Invalid output: give the model its own reply plus the exact reasons, then try once more.
    invalidResponses++;
    lastIssues = v.issues;
    messages = [...messages,
      { role: "assistant", content: reply.text },
      { role: "user", content: repairPrompt(v.issues) }];
  }
  return { ok: false, code: "INVALID_OUTPUT", message: lastIssues, raw: lastRaw,
           calls, inputTokens: inTok, outputTokens: outTok };
}

// What the USER sees. Internal errorMessage is never shown.
export const failureCopy: Record<ErrorCode, { text: string; canRetry: boolean }> = {
  TIMEOUT:               { text: "The AI service took too long to respond. Nothing was lost; please try again.", canRetry: true },
  RATE_LIMITED:          { text: "The AI service is busy right now. Please try again in a few minutes.", canRetry: true },
  PROVIDER_ERROR:        { text: "The AI service had a problem. Please try again.", canRetry: true },
  INVALID_OUTPUT:        { text: "We couldn't get a reliable result from the AI for this file. Try again, or upload a clearer version.", canRetry: true },
  NOT_A_JOB_DESCRIPTION: { text: "This file doesn't look like a job description. Please upload a job posting.", canRetry: false },
  STALE:                 { text: "Processing was interrupted. Please try again.", canRetry: true },
};

type Role = "analyst" | "prep";
type Db = { job: { update: (args: any) => Promise<unknown> } }; // Prisma client, or a test double
type Usage = { raw?: string; calls: number; inputTokens: number; outputTokens: number };

// Cost in micro-USD (integer). Prices in config are micro-USD per million tokens.
// u.inputTokens / u.outputTokens are ACCUMULATED across every call that returned a usage report
// (first call + repair calls), so this is the job's total measured spend, not the last call's.
// Calls that return no usage (429, timeout, network error) add 0, so the figure is a lower bound:
// a timed-out call may still have been billed by the provider.
const costFor = (role: Role, u: Usage) => {
  const p = config.pricingMicroUsdPerMTok[role];
  return Math.round((u.inputTokens * p.input + u.outputTokens * p.output) / 1_000_000);
};

// Terminal-state writers. A job must never stay PROCESSING after one of these runs.
// attempts = u.calls = every provider call attempted.
// Measured token usage is recorded separately; calls without usage data can make
// the recorded cost a lower bound.
export async function markDone(jobId: string, role: Role, o: Extract<Outcome<Validated<unknown>>, { ok: true }>, db: Db = prisma) {
  const { provider, model } = config.roles[role];
  await db.job.update({ where: { id: jobId }, data: {
    status: "DONE",
    // o.data is Validated<...>: it can only have come from makeValidator (see top of file).
    result: o.data as Prisma.InputJsonValue,
    rawOutput: o.raw,
    attempts: o.calls,
    provider,
    model,
    inputTokens: o.inputTokens,
    outputTokens: o.outputTokens,
    costMicroUsd: costFor(role, o),
    finishedAt: new Date(),
    errorCode: null,
    errorMessage: null,
  }});
}

export async function markFailed(jobId: string, role: Role, code: ErrorCode, internalMessage: string, u?: Usage, db: Db = prisma) {
  const { provider, model } = config.roles[role];
  await db.job.update({ where: { id: jobId }, data: {
    status: "FAILED", errorCode: code, errorMessage: internalMessage.slice(0, 2000),
    rawOutput: u?.raw, attempts: u?.calls, provider, model,
    inputTokens: u?.inputTokens, outputTokens: u?.outputTokens,
    costMicroUsd: u ? costFor(role, u) : undefined, // failed calls can still cost money
    finishedAt: new Date(),
  }});
}

// ---- Translating a model outcome into a terminal state ----

type AnalystOut = Requirements | { isJobDescription: false; reason: string };

// "The model produced invalid data" (INVALID_OUTPUT) is NOT the same as
// "the model correctly decided this isn't a job description" (NOT_A_JOB_DESCRIPTION).
// The second arrives as a VALID response, so it only becomes visible here, after validation.
// It is terminal and never retried: asking again would only spend money to get the same answer.
export async function finishAnalyze(jobId: string, o: Outcome<Validated<AnalystOut>>, db: Db = prisma) {
  if (!o.ok) return markFailed(jobId, "analyst", o.code, o.message, o, db);
  if (!o.data.isJobDescription) {
    return markFailed(jobId, "analyst", "NOT_A_JOB_DESCRIPTION", o.data.reason, o, db); // tokens/cost kept
  }
  return markDone(jobId, "analyst", o, db);
}

export async function finishPrep(jobId: string, o: Outcome<Validated<unknown>>, db: Db = prisma) {
  return o.ok ? markDone(jobId, "prep", o, db) : markFailed(jobId, "prep", o.code, o.message, o, db);
}

// Reading back: a Json column is typed `unknown` by Prisma and can be edited by hand or by a
// future migration. Re-validate before the PREPARE job trusts it as input.
export function loadRequirements(stored: unknown): Requirements {
  const r = requirementsOk.safeParse(stored);
  if (!r.success) throw new Error("Stored analysis failed re-validation");
  return r.data;
}
