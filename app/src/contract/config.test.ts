import { describe, expect, it } from "vitest";

import { requireRpcEndpoint, transactionExplorerUrl } from "./config";
import { caseRecordSchema } from "./types";


describe("GenLayer RPC configuration", () => {
  it("accepts an explicit local simulator endpoint", () => {
    expect(requireRpcEndpoint("http://127.0.0.1:4011/api")).toBe(
      "http://127.0.0.1:4011/api",
    );
  });

  it("rejects non-HTTP endpoint schemes", () => {
    expect(() => requireRpcEndpoint("file:///tmp/rpc")).toThrow(
      "GenLayer RPC endpoint must use HTTP or HTTPS",
    );
  });
});

describe("transaction explorer URLs", () => {
  const hash = `0x${"a".repeat(64)}`;

  it("links Studionet transactions to the GenLayer explorer", () => {
    expect(transactionExplorerUrl(hash, "studionet")).toBe(
      `https://explorer-studio.genlayer.com/tx/${hash}`,
    );
  });

  it("does not invent an explorer URL for localnet transactions", () => {
    expect(transactionExplorerUrl(hash, "localnet")).toBeUndefined();
  });
});

describe("v2 contract readback schema", () => {
  const terminalRecord = {
    case_id: 7,
    submitter: `0x${"1".repeat(40)}`,
    repository: "openscience/trial-a",
    commit_sha: "a".repeat(40),
    artifact_path: "reports/reproduction.md",
    evidence_hash: "b".repeat(64),
    binding: [
      "releaseproof-case-v2",
      "reproducibility-v1",
      "submit_case",
      "openscience/trial-a",
      "a".repeat(40),
      "reports/reproduction.md",
      "b".repeat(64),
    ].join("|"),
    schema_version: "releaseproof-case-v2",
    policy_version: "reproducibility-v1",
    submitted_at: "2026-01-01T00:00:00Z",
    state: "VERIFIED",
    outcome: "VERIFIED",
    reason: "All criteria are supported.",
    criteria: { question: true, procedure: true, results: true, limitations: true },
    resolver: `0x${"2".repeat(40)}`,
    observed_at: "2026-01-01T00:01:00Z",
    resolved_at: "2026-01-01T00:01:00Z",
    canonical_url: "https://raw.githubusercontent.com/openscience/trial-a/a/report.md",
  };

  it("accepts only complete v2 records instead of silently falling back to v1", () => {
    expect(caseRecordSchema.safeParse(terminalRecord).success).toBe(true);
    expect(caseRecordSchema.safeParse({
      ...terminalRecord,
      schema_version: "releaseproof-case-v1",
    }).success).toBe(false);
    const withoutObservedAt = { ...terminalRecord };
    Reflect.deleteProperty(withoutObservedAt, "observed_at");
    expect(caseRecordSchema.safeParse(withoutObservedAt).success).toBe(false);
  });
});
