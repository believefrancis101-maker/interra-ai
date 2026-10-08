// src/config.ts
// Centralized configuration for Interra AI.
// All changeable values (models, providers, timeouts, token caps, temperature,
// retry limits, rate limits, concurrency, upload limits, pricing) are defined here.

export const config = {
  // Provider and model configurations per role
  roles: {
    // Role 1: Job Description Analyst (Gemini via official @google/genai SDK)
    analyst: {
      provider: "gemini" as const,
      model: "gemini-2.5-flash",
      temperature: 0.2,
      maxOutputTokens: 4096,
      timeoutMs: 40_000,
    },
    // Role 2: Mock Interview Assistant (DeepSeek via OpenAI SDK pointed at DeepSeek base URL)
    prep: {
      provider: "deepseek" as const,
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
      temperature: 0.7,
      maxOutputTokens: 4096,
      timeoutMs: 40_000,
      questionCount: 5,
    },
  },

  // Pricing in micro-USD (integer) per million tokens (MTok).
  // 1 USD = 1,000,000 micro-USD.
  // Gemini 2.5 Flash: $0.10 / MTok input (100,000 micro-USD), $0.40 / MTok output (400,000 micro-USD).
  // DeepSeek Chat: $0.27 / MTok input cache-miss (270,000 micro-USD), $1.10 / MTok output (1,100,000 micro-USD).
  pricingMicroUsdPerMTok: {
    analyst: {
      input: 100_000,
      output: 400_000,
    },
    prep: {
      input: 270_000,
      output: 1_100_000,
    },
  },

  // Failure policy and retry limits
  retry: {
    // maxInvalidResponses: how many model responses that fail application validation
    // are tolerated before the job fails. With the value 2, the first invalid response
    // triggers one repair call and the second ends the job.
    maxInvalidResponses: 2,
    rateLimited: {
      maxRetries: 2,
      backoffMs: 5000,
    },
  },

  // Background worker processing configuration
  worker: {
    concurrency: 2,
    pollIntervalMs: 2000,
    // Stale sweeper timeout: mark PROCESSING jobs older than 5 minutes as FAILED / STALE
    staleTimeoutMs: 5 * 60 * 1000,
  },

  // Upload limits and storage configuration
  upload: {
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: [
      "text/plain",
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ] as const,
    allowedExtensions: [".txt", ".pdf", ".png", ".jpg", ".jpeg", ".webp"] as const,
    storageDir: "./storage/uploads",
  },

  // Rate limiting as cost control for trigger endpoints, prepare action, and retry action
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 10,     // Max requests per window per user
  },

  // Demo user settings (development mode uses a seeded demo user)
  demoUser: {
    id: "demo-user-1",
    email: "demo@interra.ai",
    name: "Demo Candidate",
  },

  // Server settings
  server: {
    port: Number(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || "development",
  },
} as const;

export type AppConfig = typeof config;
