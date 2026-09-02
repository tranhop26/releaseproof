import { z } from "zod";


export const terminalOutcomeSchema = z.enum([
  "VERIFIED",
  "REJECTED",
  "UNRESOLVED",
]);

export const caseRecordSchema = z
  .object({
    case_id: z.number().int().positive(),
    submitter: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    repository: z.string().min(3),
    commit_sha: z.string().regex(/^[0-9a-f]{40}$/),
    artifact_path: z.string().endsWith(".md"),
    evidence_hash: z.string().regex(/^[0-9a-f]{64}$/),
    binding: z.string().min(1),
    schema_version: z.literal("releaseproof-case-v2"),
    policy_version: z.literal("reproducibility-v1"),
    submitted_at: z.string().min(1),
    observed_at: z.string(),
    state: z.enum(["SUBMITTED", "VERIFIED", "REJECTED", "UNRESOLVED"]),
    outcome: z.union([z.literal(""), terminalOutcomeSchema]),
    reason: z.string(),
    criteria: z
      .object({
        question: z.boolean(),
        procedure: z.boolean(),
        results: z.boolean(),
        limitations: z.boolean(),
      })
      .strict(),
    resolver: z.union([z.literal(""), z.string().regex(/^0x[0-9a-fA-F]{40}$/)]),
    resolved_at: z.string(),
    canonical_url: z.string().url(),
  })
  .strict();

export type CaseRecord = z.infer<typeof caseRecordSchema>;

export const submissionInputSchema = z.object({
  repository: z.string().min(3),
  commitSha: z.string().regex(/^[0-9a-fA-F]{40}$/),
  artifactPath: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}\.md$/)
    .refine((path) => !path.includes("//") && !path.split("/").some(
      (segment) => segment === "." || segment === "..",
    ), "Artifact path is ambiguous"),
  evidenceHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
});

export type SubmissionInput = z.infer<typeof submissionInputSchema>;
export type TransactionHash = `0x${string}`;
export type ContractAddress = `0x${string}`;
