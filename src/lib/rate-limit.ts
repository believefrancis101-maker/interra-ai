// src/lib/rate-limit.ts
// Rate limiter as cost control (sliding window).
// Applied to job creation, interview prep trigger, and retry action.
import { config } from "../config";
import type { Request, Response, NextFunction } from "express";

interface HitRecord {
  timestamps: number[];
}

const userHits = new Map<string, HitRecord>();

/**
 * Checks if a user has exceeded the rate limit.
 * Returns true if the request is permitted, false if rate limited.
 */
export function checkRateLimit(
  userId: string,
  limit: number = config.rateLimit.maxRequests,
  windowMs: number = config.rateLimit.windowMs
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let record = userHits.get(userId);
  if (!record) {
    record = { timestamps: [] };
    userHits.set(userId, record);
  }

  // Filter out expired timestamps
  record.timestamps = record.timestamps.filter(ts => ts > windowStart);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const resetMs = Math.max(0, oldest + windowMs - now);
    return { allowed: false, remaining: 0, resetMs };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - record.timestamps.length,
    resetMs: windowMs,
  };
}

/**
 * Express middleware for cost-control rate limiting.
 */
export function rateLimitMiddleware(
  limit: number = config.rateLimit.maxRequests,
  windowMs: number = config.rateLimit.windowMs
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = (req as any).userId || config.demoUser.id;
    const { allowed, remaining, resetMs } = checkRateLimit(userId, limit, windowMs);

    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(resetMs / 1000));

    if (!allowed) {
      res.status(429).json({
        error: "RATE_LIMITED",
        message: "Rate limit exceeded. Please wait before triggering more AI requests.",
        retryAfterSeconds: Math.ceil(resetMs / 1000),
      });
      return;
    }

    next();
  };
}
