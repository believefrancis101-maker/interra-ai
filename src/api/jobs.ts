// src/api/jobs.ts
// Job management API routes for JobPrep AI.
// Handles uploading JDs, triggering interview prep, polling status, and retries.
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";
import { getCurrentUser } from "../lib/auth";
import { validateUploadedFile } from "../lib/file-validation";
import { rateLimitMiddleware } from "../lib/rate-limit";
import { failureCopy, type ErrorCode } from "../worker/process-job";

export const jobsRouter = Router();

// In-memory upload buffer (validated and written to storage abstraction)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // initial buffer cap before strict validation
});

/**
 * 1. POST /api/jobs/analyze
 * Uploads a job description (file or text) and enqueues a PENDING ANALYZE job.
 */
jobsRouter.post(
  "/analyze",
  rateLimitMiddleware(),
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await getCurrentUser();
      let fileBuffer: Buffer;
      let extension = ".txt";

      if (req.file) {
        fileBuffer = req.file.buffer;
        const validation = validateUploadedFile(fileBuffer);
        if (!validation.valid) {
          res.status(400).json({ error: "INVALID_FILE", message: validation.error });
          return;
        }
        extension = validation.fileType.ext;
      } else if (req.body?.text && typeof req.body.text === "string") {
        const text = req.body.text.trim();
        if (text.length < 20) {
          res.status(400).json({
            error: "INVALID_INPUT",
            message: "Pasted job description must contain at least 20 characters.",
          });
          return;
        }
        fileBuffer = Buffer.from(text, "utf-8");
        extension = ".txt";
      } else {
        res.status(400).json({
          error: "MISSING_INPUT",
          message: "Please upload a file or paste job description text.",
        });
        return;
      }

      // Save to external file storage (never in DB fields)
      const storageKey = await storage.save(fileBuffer, extension);

      // Create background job
      const job = await prisma.job.create({
        data: {
          userId: user.id,
          type: "ANALYZE",
          status: "PENDING",
          storageKey,
        },
      });

      res.status(201).json({
        jobId: job.id,
        status: job.status,
        type: job.type,
      });
    } catch (err: any) {
      console.error("[API] Error creating analyze job:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to queue job." });
    }
  }
);

/**
 * 2. POST /api/jobs/prepare
 * Triggers Role 2 interview question generation from a completed ANALYZE job.
 * Enforces: at most one live PREPARE job per parent.
 */
jobsRouter.post(
  "/prepare",
  rateLimitMiddleware(),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await getCurrentUser();
      const { parentJobId } = req.body;

      if (!parentJobId || typeof parentJobId !== "string") {
        res.status(400).json({ error: "INVALID_INPUT", message: "parentJobId is required." });
        return;
      }

      const parentJob = await prisma.job.findFirst({
        where: { id: parentJobId, userId: user.id },
      });

      if (!parentJob) {
        res.status(404).json({ error: "NOT_FOUND", message: "Analysis job not found." });
        return;
      }

      if (parentJob.status !== "DONE" || !parentJob.result) {
        res.status(400).json({
          error: "INVALID_STATE",
          message: "Parent job must be in DONE status before preparing interview questions.",
        });
        return;
      }

      // Enforce in code: at most one live PREPARE job per parent
      const liveChild = await prisma.job.findFirst({
        where: {
          parentJobId,
          type: "PREPARE",
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });

      if (liveChild) {
        res.status(409).json({
          error: "ALREADY_PREPARING",
          message: "An interview prep job is already in progress for this job description.",
          jobId: liveChild.id,
        });
        return;
      }

      const prepareJob = await prisma.job.create({
        data: {
          userId: user.id,
          type: "PREPARE",
          status: "PENDING",
          parentJobId,
        },
      });

      res.status(201).json({
        jobId: prepareJob.id,
        status: prepareJob.status,
        type: prepareJob.type,
      });
    } catch (err: any) {
      console.error("[API] Error creating prepare job:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to queue prepare job." });
    }
  }
);

/**
 * 3. GET /api/jobs/:id
 * Polls job status and results. Maps error codes to failureCopy.
 */
jobsRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getCurrentUser();
    const job = await prisma.job.findFirst({
      where: { id: req.params.id as string, userId: user.id },
    });

    if (!job) {
      res.status(404).json({ error: "NOT_FOUND", message: "Job not found." });
      return;
    }

    // Per AGENTS.md: Never display raw error strings to users.
    // Display designed failureCopy when FAILED.
    let userFailureInfo: { text: string; canRetry: boolean } | null = null;
    if (job.status === "FAILED" && job.errorCode) {
      const copy = failureCopy[job.errorCode as ErrorCode];
      userFailureInfo = copy || {
        text: "An unexpected problem occurred. Please try again.",
        canRetry: true,
      };
    }

    res.json({
      id: job.id,
      type: job.type,
      status: job.status,
      result: job.result,
      errorCode: job.errorCode,
      failure: userFailureInfo,
      attempts: job.attempts,
      inputTokens: job.inputTokens,
      outputTokens: job.outputTokens,
      costMicroUsd: job.costMicroUsd,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    });
  } catch (err: any) {
    console.error("[API] Error fetching job:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch job." });
  }
});

/**
 * 4. POST /api/jobs/:id/retry
 * Creates a NEW job row per AGENTS.md rule:
 * "A user-triggered retry creates a new job row. Do not mutate a failed job back to PENDING."
 */
jobsRouter.post(
  "/:id/retry",
  rateLimitMiddleware(),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await getCurrentUser();
      const existing = await prisma.job.findFirst({
        where: { id: req.params.id as string, userId: user.id },
      });

      if (!existing) {
        res.status(404).json({ error: "NOT_FOUND", message: "Job not found." });
        return;
      }

      if (existing.status !== "FAILED") {
        res.status(400).json({
          error: "INVALID_STATE",
          message: "Only failed jobs can be retried.",
        });
        return;
      }

      // Check if this failure type is permitted to retry (e.g. NOT_A_JOB_DESCRIPTION is not retryable)
      if (existing.errorCode === "NOT_A_JOB_DESCRIPTION") {
        res.status(400).json({
          error: "NON_RETRYABLE",
          message: failureCopy.NOT_A_JOB_DESCRIPTION.text,
        });
        return;
      }

      // Create brand new job row
      const newJob = await prisma.job.create({
        data: {
          userId: user.id,
          type: existing.type,
          status: "PENDING",
          storageKey: existing.storageKey,
          parentJobId: existing.parentJobId,
        },
      });

      res.status(201).json({
        jobId: newJob.id,
        status: newJob.status,
        type: newJob.type,
      });
    } catch (err: any) {
      console.error("[API] Error retrying job:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retry job." });
    }
  }
);
