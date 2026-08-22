import { describe, expect, it } from "vitest";

import { buildManifest, deploymentLogFields } from "./write-manifest";


const validInput = {
  network: "studionet" as const,
  contractAddress: `0x${"a".repeat(40)}`,
  deploymentTransactionHash: `0x${"b".repeat(64)}`,
  explorerUrl: `https://genlayer-explorer.vercel.app/transactions/0x${"b".repeat(64)}`,
  sourceSha256: "c".repeat(64),
  deployerAddress: `0x${"d".repeat(40)}`,
  deployedAt: "2026-08-22T12:00:00.000Z",
};

describe("deployment manifest", () => {
  it("builds the frozen, versioned deployment record", () => {
    expect(buildManifest(validInput)).toMatchObject({
      classification: "INTENTIONALLY_FROZEN",
      policyVersion: "reproducibility-v1",
      schemaVersion: "releaseproof-case-v1",
      predecessor: null,
      successor: null,
    });
  });

  it.each([
    ["contractAddress", ""],
    ["deploymentTransactionHash", ""],
    ["sourceSha256", ""],
  ])("rejects an empty %s", (field, value) => {
    expect(() => buildManifest({ ...validInput, [field]: value })).toThrow();
  });

  it("never serializes credentials or sends them to deployment logs", () => {
    const tainted = {
      ...validInput,
      privateKey: "must-not-serialize",
      vercelToken: "must-not-serialize",
    };
    const serialized = JSON.stringify(buildManifest(tainted));
    const logFields = JSON.stringify(deploymentLogFields(tainted));
    expect(serialized).not.toContain("must-not-serialize");
    expect(logFields).not.toContain("must-not-serialize");
    expect(deploymentLogFields(tainted)).toEqual({
      network: "studionet",
      contractAddress: validInput.contractAddress,
      deploymentTransactionHash: validInput.deploymentTransactionHash,
      status: "verified",
    });
  });
});
