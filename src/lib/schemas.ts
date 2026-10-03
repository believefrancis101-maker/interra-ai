// src/lib/schemas.ts
// One schema per role: used to describe the output to the model AND to validate it on receipt.
import { z } from "zod";
import { config } from "../config";

const shortText = z.string().trim().min(1).max(200);

// ---------- Role 1: Job Description Analyst ----------

const requirementsShape = z.object({
  isJobDescription: z.literal(true),
  jobTitle: shortText,
  company: shortText.nullable(),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship", "temporary", "unknown"]),
  location: shortText.nullable(),
  requiredSkills: z.array(shortText).max(30),
  preferredSkills: z.array(shortText).max(30),
  requiredExperience: z.array(z.object({
    description: shortText,
    minYears: z.number().int().nonnegative().nullable(),
  })).max(10),
  qualifications: z.array(shortText).max(15),
  responsibilities: z.array(shortText).max(25),
});

const hasContent = (r: z.infer<typeof requirementsShape>) =>
  r.requiredSkills.length + r.responsibilities.length > 0;
const NO_CONTENT = "A usable analysis needs at least one required skill or responsibility";

// Standalone use: re-validating a stored analysis (loadRequirements) and typing Requirements.
export const requirementsOk = requirementsShape.refine(hasContent, { message: NO_CONTENT });

// Designed outcome, not an error: the file was not a job description.
export const notJobDescription = z.object({
  isJobDescription: z.literal(false),
  reason: shortText,
});

// A DISCRIMINATED union (not z.union): once isJobDescription is known, Zod reports the exact failing
// fields of that branch (e.g. "employmentType: ...") instead of one useless "(root): Invalid input".
// Those messages are what the repair prompt sends back to the model.
// The cross-field rule is applied on the union so this works on Zod 3 and 4.
export const analystOutput = z
  .discriminatedUnion("isJobDescription", [requirementsShape, notJobDescription])
  .superRefine((o, ctx) => {
    if (o.isJobDescription && !hasContent(o)) ctx.addIssue({ code: "custom", message: NO_CONTENT });
  });
export type Requirements = z.infer<typeof requirementsOk>;

// ---------- Role 2: Interview Preparation Assistant ----------

// Every requirement the model is allowed to point at, taken from the VALIDATED analysis.
export function allowedRequirements(r: Requirements): string[] {
  return [
    ...r.requiredSkills, ...r.preferredSkills, ...r.qualifications,
    ...r.responsibilities, ...r.requiredExperience.map(e => e.description),
  ];
}

const norm = (s: string) => s.trim().toLowerCase();

// Built per request so the cross-check runs against THIS job's requirements.
export function makePrepOutput(req: Requirements) {
  const allowed = new Set(allowedRequirements(req).map(norm));
  const n = config.roles.prep.questionCount;

  return z.object({
    questions: z.array(z.object({
      category: z.enum(["technical", "behavioural", "role_specific"]),
      question: z.string().trim().min(10).max(400),
      relatedRequirement: shortText,
      sampleAnswer: z.string().trim().min(50).max(1500),
      interviewerLookingFor: z.string().trim().min(20).max(600),
    })).length(n),
  }).superRefine((out, ctx) => {
    out.questions.forEach((q, i) => {
      if (!allowed.has(norm(q.relatedRequirement))) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", i, "relatedRequirement"],
          message: "relatedRequirement must be copied from the extracted requirements",
        });
      }
    });
    const cats = new Set(out.questions.map(q => q.category));
    if (cats.size < 3) {
      ctx.addIssue({ code: "custom", message: "Need at least one question in each category" });
    }
  });
}
export type PrepOutput = z.infer<ReturnType<typeof makePrepOutput>>;
