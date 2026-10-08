# DOCUMENTATION.md — Interra AI 

---

## 1. What This Is

Interra AI is an AI-powered interview preparation tool. A user uploads a job description — as plain text, a PDF, or an image — and the system extracts structured requirements from it, then generates tailored mock interview questions with sample answers.

Interra AI is built around a single, focused flow that demonstrates reliable AI integration, background processing, structured output with validation, failure handling, concurrency control, and cost management.

Two AI providers are used by design:

| Role | Provider | SDK | Model |
|------|----------|-----|-------|
| Role 1 — Job Description Analyst | Google Gemini | `@google/genai` | `gemini-2.5-flash` |
| Role 2 — Interview Preparation Assistant | DeepSeek | `openai` (pointed at DeepSeek's base URL) | `deepseek-chat` |

Using two providers is a deliberate architectural choice. Each provider is accessed through its official SDK, and both are abstracted behind a single `callModel` adapter so the provider is swappable in one place.

---

## 2. How To Run It

### Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** running locally (or a remote connection string)
- A **Gemini API key** (from Google AI Studio)
- A **DeepSeek API key** (from platform.deepseek.com)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env from the template
cp .env.example .env
# Then manually paste your real API keys into .env:
#   GEMINI_API_KEY="your-key"
#   DEEPSEEK_API_KEY="your-key"
#   DATABASE_URL="postgresql://user:password@localhost:5432/interra_ai?schema=public"

# 3. Generate Prisma client
npx prisma generate

# 4. Run database migrations
npx prisma migrate dev

# 5. Start the Express server (port 3000)
npm run dev

# 6. Start the background worker (in a separate terminal)
npm run worker
```

### Other Commands

| Command | What it does |
|---------|-------------|
| `npx tsc --noEmit` | Type-check the entire project |
| `npx tsx --test src/worker/process-job.test.ts` | Run failure-policy behavioural tests |
| `npx tsx --test src/lib/call-model.test.ts` | Run adapter/SDK integration tests |
| `npx prisma studio` | Open Prisma Studio to inspect database |

### Verifying It Works

1. Open `http://localhost:3000` — the public landing page.
2. Upload or paste a job description.
3. The server validates the file, saves it to `./storage/uploads/`, and creates a `PENDING` `ANALYZE` job.
4. The worker picks it up, calls Gemini, validates the response, and writes `DONE`.
5. The UI shows the extracted requirements.
6. Click "Generate Mock Interview" — creates a `PENDING` `PREPARE` job.
7. The worker calls DeepSeek with the validated requirements (never the raw file), validates the response, and writes `DONE`.
8. The UI shows mock interview questions, sample answers, and what the interviewer is looking for.

---

## 3. The Flow, Step By Step

```
User uploads file ──► POST /api/jobs/analyze
                          │
                          ├─ Validate file (magic bytes, size limit)
                          ├─ Save to ./storage/uploads/{uuid}.{ext}
                          ├─ Create Job row: type=ANALYZE, status=PENDING
                          └─ Return { jobId, status }

Worker polls PENDING jobs (FIFO, oldest first)
          │
          ├─ Claim: PENDING → PROCESSING (atomic updateMany)
          ├─ Read file from storage
          ├─ Detect file type (magic bytes)
          ├─ Build system prompt + attach file
          ├─ Call Gemini via callModel adapter
          │     ├─ Timeout? → FAILED / TIMEOUT (no retry)
          │     ├─ HTTP 429? → Backoff + retry (separate budget, up to 2 retries)
          │     ├─ Other error? → FAILED / PROVIDER_ERROR (no retry)
          │     └─ Got text response
          │           ├─ Parse JSON + validate against analystOutput schema
          │           ├─ Valid + isJobDescription:true → DONE, store validated result
          │           ├─ Valid + isJobDescription:false → FAILED / NOT_A_JOB_DESCRIPTION (no retry)
          │           └─ Invalid → Send repair prompt with rejection reasons
          │                 ├─ Second response valid → DONE
          │                 └─ Second response invalid → FAILED / INVALID_OUTPUT
          └─ Record: attempts, tokens, costMicroUsd, rawOutput, finishedAt

User clicks "Generate Mock Interview" ──► POST /api/jobs/prepare
          │
          ├─ Verify parent ANALYZE job is DONE
          ├─ Enforce: at most one live PREPARE per parent (code + partial unique index)
          ├─ Create Job row: type=PREPARE, status=PENDING, parentJobId
          └─ Return { jobId, status }

Worker picks up PREPARE job
          │
          ├─ Load parent's stored result
          ├─ Re-validate with loadRequirements() (Prisma Json is unknown)
          ├─ Build prep schema with cross-check (makePrepOutput)
          ├─ Build system prompt (no raw file — only validated requirements JSON)
          ├─ Call DeepSeek via callModel adapter
          │     └─ Same failure/validation/repair policy as Role 1
          └─ finishPrep → DONE or FAILED

Frontend polls GET /api/jobs/:id for status updates
          │
          ├─ PENDING / PROCESSING → show spinner
          ├─ DONE → render result
          └─ FAILED → show failureCopy[errorCode].text (never raw errorMessage)
```

---

## 4. The Data Model

### User

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID, default generated |
| email | TEXT UNIQUE | |
| name | TEXT? | |
| createdAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |

A seeded demo user (`demo-user-1`) is included for local development. Full authentication is planned for a future release.

### Job

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| userId | TEXT FK → User | Scoped to user |
| type | TEXT | `ANALYZE` or `PREPARE` (CHECK constraint) |
| status | TEXT | `PENDING` → `PROCESSING` → `DONE` or `FAILED` (CHECK constraint) |
| storageKey | TEXT? | Server-generated UUID path to uploaded file. Never the user's filename. |
| result | JSONB? | Validated output only (analyst requirements or prep questions) |
| rawOutput | TEXT? | Last raw model response text |
| provider | TEXT? | `gemini` or `deepseek` |
| model | TEXT? | `gemini-2.5-flash` or `deepseek-chat` |
| attempts | INT | Total provider calls (first + repair + 429 retries) |
| inputTokens | INT? | Accumulated across all calls reporting usage |
| outputTokens | INT? | Accumulated (includes thinking tokens for Gemini) |
| costMicroUsd | INT? | Measured spend in micro-USD (lower bound — timed-out calls add 0) |
| errorCode | TEXT? | `TIMEOUT`, `RATE_LIMITED`, `PROVIDER_ERROR`, `INVALID_OUTPUT`, `NOT_A_JOB_DESCRIPTION`, `STALE` (CHECK constraint) |
| errorMessage | TEXT? | Internal only. Users see `failureCopy` messages. |
| parentJobId | TEXT? FK → Job | PREPARE jobs point to a DONE ANALYZE job |
| startedAt | TIMESTAMP? | Set when claimed by worker |
| finishedAt | TIMESTAMP? | Set by markDone/markFailed |
| createdAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |

### Database Constraints (in migration SQL, not Prisma schema)

- **CHECK `check_job_status`**: status must be one of the four lifecycle values.
- **CHECK `check_job_type`**: type must be `ANALYZE` or `PREPARE`.
- **CHECK `check_job_error_code`**: errorCode must be NULL or one of the six defined codes.
- **Partial Unique Index `unique_live_prepare_per_parent`**: at most one PREPARE job in `PENDING` or `PROCESSING` per parentJobId. Prevents duplicate in-flight prep work.

### Indexes

- `(status, createdAt)` — FIFO worker lookup.
- `(userId)` — user-scoped queries.
- `(parentJobId)` — parent–child lookups.

---

## 5. The Concepts

### 5.1 What an API Endpoint Is

**What it is.** An API endpoint is a URL path that the server exposes for clients to send requests to. Each endpoint accepts a specific HTTP method (GET, POST) and returns structured JSON.

**Why it is needed.** The frontend needs a way to communicate with the backend: uploading files, creating jobs, polling status, and triggering retries. Endpoints give each action a distinct address and a predictable request/response contract.

**How I implemented it.** The server uses Express with a `jobsRouter` mounted at `/api/jobs`. Four endpoints exist:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/jobs/analyze` | POST | Upload a JD, create an ANALYZE job |
| `/api/jobs/prepare` | POST | Trigger mock interview generation from a completed analysis |
| `/api/jobs/:id` | GET | Poll job status and result |
| `/api/jobs/:id/retry` | POST | Create a new job row from a failed job |

All endpoints are defined in `src/api/jobs.ts`. Rate limiting is applied to the three mutating endpoints as cost control. A health check lives at `/api/health`.

**What I chose against and why.** I considered REST sub-resources (e.g. `/api/jobs/:id/prepare`) but kept the routes flat because there are only four of them and the parent–child relationship is already handled by `parentJobId` in the request body. A flat structure is simpler to explain.

### 5.2 SDKs Versus Raw HTTP

**What it is.** An SDK (Software Development Kit) is a library provided by a service vendor that wraps their HTTP API, handling authentication, serialization, error formatting, and retries.

**Why it is needed.** Two AI providers (Gemini and DeepSeek) are called from the worker. Using official SDKs avoids manually constructing HTTP requests, parsing streaming responses, managing authentication headers, and handling provider-specific error shapes.

**How I implemented it.** Role 1 uses `@google/genai` (the official Gemini SDK). Role 2 uses `openai` (the official OpenAI SDK) pointed at DeepSeek's base URL (`https://api.deepseek.com`), because DeepSeek exposes an OpenAI-compatible API. Both SDKs are instantiated in `src/lib/call-model.ts` through `realDeps`, which injects the SDK clients into `makeCaller()`.

SDK-level retries are disabled:
- Gemini: `httpOptions.retryOptions.attempts = 1`
- DeepSeek/OpenAI: `maxRetries = 0`

This is deliberate: the application's own failure policy (`runWithPolicy`) owns retry decisions, so SDK retries would hide provider calls from the `attempts` counter and bypass the 429 budget.

**What I chose against and why.** Raw `fetch` calls were considered, but rejected because:
1. Both SDKs handle authentication, content negotiation, and streaming automatically.
2. The Gemini SDK supports native JSON Schema enforcement (`responseJsonSchema`), which is not trivially replicable with raw HTTP.
3. Using official SDKs ensures long-term maintainability and access to provider-specific features.

### 5.3 System Prompts Versus User Prompts

**What it is.** A system prompt is an instruction sent to the model alongside (but distinct from) the user's message. It defines the model's role, output format, and constraints. A user prompt is the per-request content — the actual document to analyse or the requirements to prepare questions for.

**Why it is needed.** Separating system instructions from user content prevents the model from confusing "what it should do" with "what the user said". This is critical for security: job descriptions are untrusted user content that could contain prompt-injection attempts.

**How I implemented it.**

- **Role 1 (Gemini)**: The system prompt is passed via Gemini's native `systemInstruction` field, which the SDK treats as a privileged channel separate from the conversation. The uploaded document is wrapped in `<document>` tags and sent as part of the first user message, making it clear the document is DATA, not instructions. The closing `</document>` tag inside the document is neutralised to prevent injection.

- **Role 2 (DeepSeek)**: The system prompt is prepended as a `{ role: "system" }` message, because the OpenAI chat completions format uses a message array rather than a separate system field. Role 2 never receives the raw file — only the validated requirements JSON from Role 1. This boundary is enforced by a runtime guard: `makeCaller("prep", { file: ... })` throws immediately.

Both system prompts live in `src/worker/index.ts`, in `runAnalyzeJob()` and `runPrepareJob()` respectively.

**What I chose against and why.** Embedding the system instructions directly in the user message would work functionally, but would make it harder for the model to distinguish instructions from data. Gemini's dedicated `systemInstruction` channel gives it explicit priority, which is preferable for security.

### 5.4 Model Parameters

**What it is.** Model parameters are settings sent with each AI request that control the model's behaviour: which model to use, how creative or deterministic the output should be (temperature), how many tokens to generate (maxOutputTokens), and how long to wait (timeout).

**Why it is needed.** Different roles need different behaviour. The analyst should be precise and deterministic (low temperature); the mock interview assistant can be more varied (higher temperature). Token caps prevent runaway cost. Timeouts prevent hung requests from blocking the worker.

**How I implemented it.** All parameters live in `src/config.ts` under `config.roles`:

| Parameter | Analyst (Role 1) | Prep (Role 2) |
|-----------|------------------|---------------|
| model | `gemini-2.5-flash` | `deepseek-chat` |
| temperature | 0.2 | 0.7 |
| maxOutputTokens | 4096 | 4096 |
| timeoutMs | 40,000 | 40,000 |

The caller functions read these from config and pass them directly to the SDK. Nothing is hardcoded in the worker or handler code.

**What I chose against and why.** Hardcoding parameters inline would be simpler for a one-off script, but centralizing all changeable values in one place makes the system easier to tune and maintain. A config object is the simplest pattern that satisfies this.

### 5.5 Structured Output and Schema Validation

**What it is.** Structured output means requiring the model to return JSON conforming to a specific schema, rather than free-form prose. Schema validation means checking the model's response against application-owned schemas after receiving it.

**Why it is needed.** The downstream code (the frontend, the prep role, the database) expects data in a known shape. Models can hallucinate fields, skip required ones, or return prose despite being asked for JSON. Without validation, a single malformed response could corrupt stored data or crash the UI.

**How I implemented it.**

1. **Schemas** are defined in `src/lib/schemas.ts` using Zod:
   - `analystOutput`: a discriminated union on `isJobDescription`. When `true`, it requires `jobTitle`, `requiredSkills`, `responsibilities`, etc. When `false`, just a `reason`.
   - `makePrepOutput(requirements)`: built per-request from the validated Role 1 requirements. Each `relatedRequirement` in the output is cross-checked against the actual extracted requirements set.

2. **Model-side enforcement**: Gemini supports native JSON Schema via `responseJsonSchema`, so the Zod schema is converted using `z.toJSONSchema()` and passed to the SDK. DeepSeek only supports `json_object` mode, so the JSON Schema text is appended to the system prompt.

3. **Application-side enforcement** (the authority): `makeValidator(schema)` in `process-job.ts` JSON-parses the response and runs `schema.safeParse()`. Only on success does it produce a `Validated<T>` — a branded type that cannot be constructed outside `makeValidator`. `markDone()` only accepts `Validated` data, making it a compile-time error to store unvalidated output.

4. **Repair**: If validation fails, the model gets one repair call containing its rejected response and the exact Zod error messages. If the repair also fails, the job ends `FAILED` with `INVALID_OUTPUT`.

**What I chose against and why.** Relying solely on the model's native JSON mode was considered but rejected. Gemini's native schema enforcement is helpful but not a guarantee (it can still produce invalid data). DeepSeek's `json_object` mode only guarantees the response is parseable JSON, not that it matches the schema. Application validation is the authority in both cases.

### 5.6 Jobs and Workers

**What it is.** A job is a record representing a unit of background work. A worker is a process that picks up pending jobs and processes them.

**Why it is needed.** AI model calls are slow (seconds to tens of seconds). Running them in the request handler would block the HTTP server and time out clients. A background job lets the API respond immediately ("your job is queued") while the worker processes it asynchronously.

**How I implemented it.**

- **Job lifecycle**: `PENDING` → `PROCESSING` → `DONE` or `FAILED`. Every code path ends in `markDone` or `markFailed`. A `try/catch` around `executeJob` ensures that even an unexpected exception triggers `markFailed` — no job stays stuck in `PROCESSING`.

- **Worker** (`src/worker/index.ts`): A `WorkerQueue` class polls the database on an interval (`pollIntervalMs: 2000`). It claims jobs atomically using `updateMany` with a `WHERE status = 'PENDING'` guard, which prevents race conditions if multiple workers ran. Processing happens in the background; the poll loop continues without waiting.

- **Stale sweeper**: A separate interval marks `PROCESSING` jobs older than `staleTimeoutMs` (5 minutes) as `FAILED` with `STALE`. This is the safety net for crashed workers.

- **Two job types**: `ANALYZE` (Role 1) and `PREPARE` (Role 2). A PREPARE job has a `parentJobId` pointing to a DONE ANALYZE job. This relationship spans two rows, so it is enforced in application code, not by a single-row database constraint.

**What I chose against and why.** A message queue (Redis, RabbitMQ) would add operational complexity and a dependency. For the current scale, the database is the queue — Postgres is already required for data storage, so using it as a simple job queue avoids introducing another moving part. A dedicated queue (e.g. BullMQ) would be the next step if throughput demands grow.

### 5.7 Queues, FIFO, and Why Concurrency Is Capped

**What it is.** A queue is an ordered list of work items. FIFO (First-In, First-Out) means the oldest item is processed first. A concurrency cap limits how many items are processed simultaneously.

**Why it is needed.** Without FIFO, a burst of new uploads could starve earlier jobs. Without a concurrency cap, the worker could fire dozens of parallel AI requests, blowing through rate limits and API budgets in seconds.

**How I implemented it.** The worker queries `WHERE status = 'PENDING' ORDER BY createdAt ASC` — that is FIFO. It tracks `activeJobs` and only claims new jobs while `activeJobs < config.worker.concurrency` (set to 2). The concurrency cap is the first line of defence against runaway cost: at most 2 model calls can be in flight at any time.

**What I chose against and why.** Priority queues were considered (e.g. giving retries higher priority) but rejected. The queue is small (single-user demo), and FIFO is the simplest fair policy. The cap of 2 is conservative by design: it keeps costs predictable during development and testing.

### 5.8 Rate Limiting as a Cost Control

**What it is.** Rate limiting restricts how many requests a user can make to a particular endpoint within a time window. It is applied as middleware before the request reaches the handler.

**Why it is needed.** Each AI request costs real money. Without rate limiting, a user (or an automated script) could flood the system with uploads, each triggering a model call. Rate limiting is the second line of defence (after the concurrency cap) against runaway cost.

**How I implemented it.** A sliding-window rate limiter in `src/lib/rate-limit.ts` tracks timestamps per user in memory. The default limit is 10 requests per 60-second window. It is applied as Express middleware on:

- `POST /api/jobs/analyze` (triggers an AI call)
- `POST /api/jobs/prepare` (triggers an AI call)
- `POST /api/jobs/:id/retry` (triggers an AI call)

The response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. When exceeded, the server returns HTTP 429 with a user-facing message and `retryAfterSeconds`.

**What I chose against and why.** A Redis-backed rate limiter (e.g. `rate-limiter-flexible`) would survive server restarts and work across multiple server instances. For the current single-process deployment, in-memory is sufficient and avoids adding a Redis dependency. Redis-backed limiting is the natural next step for horizontal scaling.

### 5.9 Why Files Live in Object Storage Rather Than the Database

**What it is.** Object storage means saving uploaded files as blobs on the filesystem (or in a cloud bucket like S3/GCS), and storing only a reference key in the database.

**Why it is needed.** Storing file bytes directly in PostgreSQL (as `BYTEA` or `TEXT`) bloats the database, slows down queries, makes backups enormous, and complicates streaming large files. Databases are designed for structured data, not binary blobs.

**How I implemented it.** The `LocalFileStorage` class in `src/lib/storage.ts` implements a `StorageProvider` interface with `save`, `read`, `readText`, `delete`, and `exists` methods. In development, files go to `./storage/uploads/`. The storage key is a server-generated UUID with the detected file extension — the user's original filename is never used in the storage path, preventing path-traversal attacks. Only the key (e.g. `a1b2c3d4-...-ef56.pdf`) is stored in the `storageKey` column.

The interface is designed so that in production, `LocalFileStorage` could be swapped for an S3 or GCS implementation without changing any caller code.

**What I chose against and why.** Storing files as base64 in a `TEXT` column was the simplest option but introduces every problem described above. The storage abstraction adds ~80 lines of code and eliminates all of them, while providing a clean migration path to cloud object storage.

### 5.10 The Cost Model

**What it is.** The cost model tracks how much each AI job costs in terms of tokens consumed and money spent.

**Why it is needed.** AI APIs charge per token. Without tracking, there is no visibility into whether a single job cost $0.001 or $0.10. Cost data enables informed decisions about model selection, prompt efficiency, and budget alerts.

**How I implemented it.**

- **Token accounting**: `inputTokens` and `outputTokens` are accumulated across every provider call that reports usage (first call + repair calls). For Gemini, "thinking" tokens (`thoughtsTokenCount`) are included in `outputTokens` because they are billed as output. Calls that fail with 429, timeout, or network errors report no usage and add 0.

- **Cost calculation**: `costFor(role, usage)` in `process-job.ts` computes `costMicroUsd` using prices from `config.pricingMicroUsdPerMTok`:

  | Provider | Input (micro-USD/MTok) | Output (micro-USD/MTok) |
  |----------|----------------------|------------------------|
  | Gemini 2.5 Flash | 100,000 | 400,000 |
  | DeepSeek Chat | 270,000 | 1,100,000 |

  Cost is stored as an integer in micro-USD (1 USD = 1,000,000 micro-USD) to avoid floating-point issues.

- **Lower bound**: The stored cost is a measured lower bound, not an exact bill. A timed-out call may still have been billed by the provider but reports no usage data. Failed jobs still record whatever tokens were consumed before failure.

**What I chose against and why.** Fetching actual billing data from provider dashboards would give exact figures but is not available via the SDK at call time. Computing cost from reported usage is immediate, testable, and sufficient for operational monitoring.

---

## 6. What Went Wrong

> **TODO(developer):** This section is yours. Describe the problems you actually hit — not hypothetical risks, but real things that went wrong during development, how you discovered them, and what you did. Examples: a model returning prose instead of JSON, a race condition during polling, a schema that was too strict, a 429 storm during testing, cost surprises, a bug in the repair prompt.
>
> This section is where the assessor checks that you understood what happened, not just that the code works.

---

## 7. What This Slice Does Not Handle

This is the initial release of Interra AI. The following are not yet implemented:

- **Full authentication**: Sign-up, sign-in, sessions, and password flows are planned. The current release uses a seeded demo user for development.
- **Multi-tenancy**: User management and multi-user support are planned for a future release.
- **Job searching, job applications, candidate fit scoring, or "should I apply?" recommendations.**
- **Employer accounts, recruitment management, or application tracking.**
- **Scheduling, payments, or social features.**
- **Sharing, export, or editing of results.**
- **Landing or marketing pages** beyond the basic product homepage.
- **Production deployment**: No Docker, CI/CD, HTTPS, or cloud infrastructure.
- **Horizontal scaling**: The worker is single-process. The in-memory rate limiter does not survive restarts or span multiple instances.
- **Streaming responses**: The worker waits for the full model response before validating. Streaming would require incremental JSON parsing.
- **Conversation or follow-up**: Each job is a single-shot interaction. The model has no memory between jobs.
- **File retention policy**: Uploaded files are stored indefinitely. A production system would need cleanup.

---

## 8. If I Built This Again

> **TODO(developer):** This section is yours. Reflect on what you would do differently with hindsight. Examples: a different queue backend, streaming validation, a different provider choice, changing how repair prompts work, a different schema design, something you over-engineered or under-engineered.
>
> Be specific. "I would use a better architecture" is not useful. "I would replace the database-backed queue with BullMQ because polling every 2 seconds wastes connections" is.

---

> **TODO(developer):** Write the LinkedIn reflection post separately. It must reflect your own experience.
