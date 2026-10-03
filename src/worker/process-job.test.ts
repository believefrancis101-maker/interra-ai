// src/worker/process-job.test.ts
// Run: npx tsx --test src/worker/process-job.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../config";
import { analystOutput, makePrepOutput, requirementsOk } from "../lib/schemas";
import {
  ModelError, makeValidator, runWithPolicy, finishAnalyze, finishPrep,
} from "./process-job";

// Non-zero prices so cost accumulation is actually testable: cost = in*1 + out*2 micro-USD.
(config as any).pricingMicroUsdPerMTok.analyst = { input: 1_000_000, output: 2_000_000 };

// ---------- fixtures ----------
const GOOD = {
  isJobDescription: true, jobTitle: "Backend Engineer", company: "Acme",
  employmentType: "full_time", location: null,
  requiredSkills: ["Node.js", "PostgreSQL"], preferredSkills: ["Docker"],
  requiredExperience: [{ description: "3+ years backend", minYears: 3 }],
  qualifications: ["BSc Computer Science"], responsibilities: ["Design REST APIs"],
};
const GOOD_TEXT = JSON.stringify(GOOD);
const NOT_JD_TEXT = JSON.stringify({ isJobDescription: false, reason: "This appears to be a CV." });
const WRONG_SHAPE_TEXT = JSON.stringify({ isJobDescription: true, jobTitle: "x" }); // valid JSON, fails schema
const BROKEN_JSON = "Sure! Here are the requirements: {not json";

type Step = string | ModelError | Error;
const IN = 300, OUT = 100; // tokens reported per reply

function fakeCall(steps: Step[]) {
  const seen: { role: string; content: string }[][] = [];
  let i = 0;
  const call = async (messages: any) => {
    seen.push(messages);
    const s = steps[i++];
    if (s === undefined) throw new Error("test ran out of scripted replies");
    if (typeof s !== "string") throw s;
    return { text: s, inputTokens: IN, outputTokens: OUT };
  };
  return { call, seen, callsMade: () => i };
}

function fakeDb() {
  const writes: any[] = [];
  return { writes, db: { job: { update: async (a: any) => { writes.push(a); } } } };
}

const sleeps: number[] = [];
const sleep = async (ms: number) => { sleeps.push(ms); };
const run = (steps: Step[]) => {
  sleeps.length = 0;
  const f = fakeCall(steps);
  const out = runWithPolicy({
    messages: [{ role: "user", content: "analyse this" }],
    call: f.call, validate: makeValidator(analystOutput), sleep,
  });
  return { out, ...f };
};

// ---------- 1. valid response -> DONE ----------
test("1. valid response -> DONE with every field written", async () => {
  const { out, callsMade } = run([GOOD_TEXT]);
  const o = await out; const { db, writes } = fakeDb();
  await finishAnalyze("j1", o, db);
  const d = writes[0].data;
  assert.equal(callsMade(), 1);
  assert.equal(d.status, "DONE");
  assert.equal(d.rawOutput, GOOD_TEXT);       // the field the earlier comment bug would have dropped
  assert.equal(d.attempts, 1);                // ... and this one
  assert.deepEqual(d.result, GOOD);
  assert.equal(d.errorCode, null);
  assert.deepEqual(Object.keys(d).sort(), [
    "attempts", "costMicroUsd", "errorCode", "errorMessage", "finishedAt", "inputTokens",
    "model", "outputTokens", "provider", "rawOutput", "result", "status",
  ]);
});

// ---------- 2. invalid JSON -> repair ----------
test("2a. invalid JSON then valid -> DONE; repair call sees the rejected reply; usage accumulates", async () => {
  const { out, seen } = run([BROKEN_JSON, GOOD_TEXT]);
  const o = await out; const { db, writes } = fakeDb();
  await finishAnalyze("j2", o, db);
  const d = writes[0].data;
  assert.equal(d.status, "DONE");
  assert.equal(d.attempts, 2);
  assert.equal(d.rawOutput, GOOD_TEXT);
  assert.equal(d.inputTokens, IN * 2);         // accumulated, not just the last call
  assert.equal(d.outputTokens, OUT * 2);
  assert.equal(d.costMicroUsd, IN * 2 * 1 + OUT * 2 * 2); // 600 + 400 = 1000
  const repair = seen[1];
  assert.equal(repair.at(-2)!.role, "assistant");
  assert.equal(repair.at(-2)!.content, BROKEN_JSON);
  assert.match(repair.at(-1)!.content, /not valid JSON/);
});

test("2b. invalid JSON twice -> FAILED / INVALID_OUTPUT / last raw / attempts 2", async () => {
  const second = "still { not json";
  const { out, callsMade } = run([BROKEN_JSON, second]);
  const o = await out; const { db, writes } = fakeDb();
  await finishAnalyze("j3", o, db);
  const d = writes[0].data;
  assert.equal(callsMade(), 2);                // no third call
  assert.equal(d.status, "FAILED");
  assert.equal(d.errorCode, "INVALID_OUTPUT");
  assert.equal(d.rawOutput, second);           // LAST raw response, not the first
  assert.equal(d.attempts, 2);
  assert.equal(d.result, undefined);           // nothing unvalidated is stored as a result
  assert.equal(d.costMicroUsd, 1000);          // failed work still costs money, and is recorded
});

// ---------- 3. invalid schema -> repair ----------
test("3a. valid JSON, wrong schema, then valid -> DONE; repair names the failing fields", async () => {
  const { out, seen } = run([WRONG_SHAPE_TEXT, GOOD_TEXT]);
  const o = await out;
  assert.equal(o.ok, true);
  assert.equal(o.calls, 2);
  assert.match(seen[1].at(-1)!.content, /rejected for these reasons/);
  assert.match(seen[1].at(-1)!.content, /employmentType|requiredSkills|responsibilities/); // real paths
});

test("3b. wrong schema twice -> FAILED / INVALID_OUTPUT / attempts 2", async () => {
  const { out, callsMade } = run([WRONG_SHAPE_TEXT, WRONG_SHAPE_TEXT]);
  const o = await out; const { db, writes } = fakeDb();
  await finishAnalyze("j4", o, db);
  const d = writes[0].data;
  assert.equal(callsMade(), 2);
  assert.equal(d.status, "FAILED");
  assert.equal(d.errorCode, "INVALID_OUTPUT");
  assert.equal(d.rawOutput, WRONG_SHAPE_TEXT);
  assert.equal(d.attempts, 2);
});

// ---------- 4. isJobDescription:false ----------
test("4. isJobDescription:false -> NOT_A_JOB_DESCRIPTION, no retry, cost kept", async () => {
  const { out, callsMade } = run([NOT_JD_TEXT]);
  const o = await out; const { db, writes } = fakeDb();
  await finishAnalyze("j5", o, db);
  const d = writes[0].data;
  assert.equal(o.ok, true);                    // it was a VALID response...
  assert.equal(callsMade(), 1);                // ...so it is never retried
  assert.equal(d.status, "FAILED");
  assert.equal(d.errorCode, "NOT_A_JOB_DESCRIPTION");  // ...and is not INVALID_OUTPUT
  assert.equal(d.errorMessage, "This appears to be a CV.");
  assert.equal(d.attempts, 1);
  assert.equal(d.costMicroUsd, IN * 1 + OUT * 2);
});

// ---------- 5. 429 ----------
test("5a. 429 then success -> backs off 5s, retries, DONE", async () => {
  const { out } = run([new ModelError("RATE_LIMITED", "429"), GOOD_TEXT]);
  const o = await out;
  assert.equal(o.ok, true);
  assert.equal(o.calls, 2);
  assert.deepEqual(sleeps, [5000]);
});

test("5b. 429 three times -> RATE_LIMITED after 2 retries (3 calls), backoff 5s then 10s", async () => {
  const e = () => new ModelError("RATE_LIMITED", "429");
  const { out } = run([e(), e(), e()]);
  const o = await out;
  assert.equal(o.ok, false);
  assert.equal((o as any).code, "RATE_LIMITED");
  assert.equal(o.calls, 3);
  assert.deepEqual(sleeps, [5000, 10000]);
});

test("5c. 429s do NOT use the invalid-output budget (attempts can exceed 2)", async () => {
  const { out } = run([new ModelError("RATE_LIMITED", "429"), BROKEN_JSON, BROKEN_JSON]);
  const o = await out; const { db, writes } = fakeDb();
  await finishAnalyze("j6", o, db);
  const d = writes[0].data;
  assert.equal(d.errorCode, "INVALID_OUTPUT");
  assert.equal(d.attempts, 3);                 // 1 rate-limited + 2 invalid responses
});

// ---------- 6. timeout / 7. provider error ----------
test("6. timeout -> TIMEOUT, no automatic retry", async () => {
  const { out, callsMade } = run([new ModelError("TIMEOUT", "aborted after 40000ms"), GOOD_TEXT]);
  const o = await out; const { db, writes } = fakeDb();
  await finishAnalyze("j7", o, db);
  assert.equal(callsMade(), 1);                // the scripted success was never requested
  assert.equal(writes[0].data.status, "FAILED");
  assert.equal(writes[0].data.errorCode, "TIMEOUT");
  assert.equal(writes[0].data.attempts, 1);
});

test("7a. provider error (ModelError) -> PROVIDER_ERROR, no retry", async () => {
  const { out, callsMade } = run([new ModelError("PROVIDER_ERROR", "503"), GOOD_TEXT]);
  const o = await out;
  assert.equal(callsMade(), 1);
  assert.equal((o as any).code, "PROVIDER_ERROR");
});

test("7b. unknown thrown error is classified PROVIDER_ERROR, never left unhandled", async () => {
  const { out } = run([new Error("socket hang up")]);
  const o = await out;
  assert.equal(o.ok, false);
  assert.equal((o as any).code, "PROVIDER_ERROR");
});

// ---------- Role 2: cross-check against the validated requirements ----------
const REQ = requirementsOk.parse(GOOD);
const q = (category: string, related: string) => ({
  category, question: "Tell me about a time you worked on this.", relatedRequirement: related,
  sampleAnswer: "I led a project where I applied this skill end to end, measured the result, and iterated.",
  interviewerLookingFor: "Concrete ownership and measurable outcomes.",
});
const prepGood = { questions: [
  q("technical", "Node.js"), q("technical", "PostgreSQL"), q("behavioural", "Design REST APIs"),
  q("role_specific", "3+ years backend"), q("behavioural", "Docker"),
]};

test("8a. prep output citing only extracted requirements validates", () => {
  const v = makeValidator(makePrepOutput(REQ))(JSON.stringify(prepGood));
  assert.equal(v.ok, true);
});

test("8b. prep output citing an invented requirement is rejected, with the path named", () => {
  const bad = structuredClone(prepGood);
  bad.questions[2].relatedRequirement = "Kubernetes";           // not in the JD
  const v = makeValidator(makePrepOutput(REQ))(JSON.stringify(bad));
  assert.equal(v.ok, false);
  assert.match((v as any).issues, /questions\.2\.relatedRequirement/);
});

test("8c. prep with the wrong number of questions is rejected", () => {
  const bad = { questions: prepGood.questions.slice(0, 3) };
  assert.equal(makeValidator(makePrepOutput(REQ))(JSON.stringify(bad)).ok, false);
});

test("8d. prep failure is recorded against the prep role", async () => {
  const { out } = await (async () => {
    const f = fakeCall([BROKEN_JSON, BROKEN_JSON]);
    const o = await runWithPolicy({
      messages: [{ role: "user", content: "prepare" }],
      call: f.call, validate: makeValidator(makePrepOutput(REQ)), sleep,
    });
    return { out: o };
  })();
  const { db, writes } = fakeDb();
  await finishPrep("j8", out, db);
  assert.equal(writes[0].data.errorCode, "INVALID_OUTPUT");
  assert.equal(writes[0].data.provider, config.roles.prep.provider);
});
