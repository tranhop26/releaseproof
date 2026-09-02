import { describe, expect, it, vi } from "vitest";

import { reconcileTransaction } from "./reconcile";


const hash = `0x${"1".repeat(64)}` as const;

function verifiedCase() {
  return {
    case_id: 1,
    submitter: `0x${"2".repeat(40)}`,
    repository: "openscience/trial-a",
    commit_sha: "a".repeat(40),
    artifact_path: "reports/reproduction.md",
    evidence_hash: "b".repeat(64),
    binding: "releaseproof-case-v2|reproducibility-v1|submit_case|evidence",
    schema_version: "releaseproof-case-v2",
    policy_version: "reproducibility-v1",
    submitted_at: "2026-01-01T00:00:00Z",
    observed_at: "2026-01-01T00:01:00Z",
    state: "VERIFIED" as const,
    outcome: "VERIFIED" as const,
    reason: "All criteria are supported.",
    criteria: {
      question: true,
      procedure: true,
      results: true,
      limitations: true,
    },
    resolver: `0x${"3".repeat(40)}`,
    resolved_at: "2026-01-01T00:01:00Z",
    canonical_url: "https://raw.githubusercontent.com/example",
  };
}

describe("reconcileTransaction", () => {
  it("does not read terminal state before finalized execution success", async () => {
    const api = {
      waitForReceipt: vi.fn().mockResolvedValue({ statusName: "PENDING" }),
      readCase: vi.fn(),
    };

    await expect(reconcileTransaction(api, hash, 1)).resolves.toMatchObject({
      phase: "pending",
    });
    expect(api.readCase).not.toHaveBeenCalled();
  });

  it("reads back only after FINISHED_WITH_RETURN", async () => {
    const api = {
      waitForReceipt: vi.fn().mockResolvedValue({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readCase: vi.fn().mockResolvedValue(verifiedCase()),
    };

    await expect(reconcileTransaction(api, hash, 1)).resolves.toMatchObject({
      phase: "readback",
      case: { state: "VERIFIED" },
    });
  });

  it("keeps execution errors distinct from unresolved outcomes", async () => {
    const errorApi = {
      waitForReceipt: vi.fn().mockResolvedValue({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_ERROR",
      }),
      readCase: vi.fn(),
    };
    await expect(reconcileTransaction(errorApi, hash, 1)).resolves.toMatchObject({
      phase: "execution_error",
    });
    expect(errorApi.readCase).not.toHaveBeenCalled();

    const unresolved = {
      ...verifiedCase(),
      state: "UNRESOLVED" as const,
      outcome: "UNRESOLVED" as const,
    };
    const unresolvedApi = {
      waitForReceipt: vi.fn().mockResolvedValue({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readCase: vi.fn().mockResolvedValue(unresolved),
    };
    await expect(reconcileTransaction(unresolvedApi, hash, 1)).resolves.toMatchObject({
      phase: "readback",
      case: { state: "UNRESOLVED" },
    });
  });
});
