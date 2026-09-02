import { describe, expect, it } from "vitest";

import {
  buildManifest,
  buildPredecessorManifest,
  deploymentLogFields,
} from "./write-manifest";


const validInput = {
  network: "studionet" as const,
  contractAddress: `0x${"a".repeat(40)}`,
  deploymentTransactionHash: `0x${"b".repeat(64)}`,
  explorerUrl: `https://genlayer-explorer.vercel.app/transactions/0x${"b".repeat(64)}`,
  sourceSha256: "c".repeat(64),
  deployerAddress: `0x${"d".repeat(40)}`,
  deployedAt: "2026-08-22T12:00:00.000Z",
  schemaVersion: "releaseproof-case-v2" as const,
  policyVersion: "reproducibility-v1" as const,
  predecessor: "0x946BC9B19BD971CBefb56845b5825FB7B9f6b183",
};

describe("deployment manifest", () => {
  it("builds the frozen, versioned deployment record", () => {
    expect(buildManifest(validInput)).toMatchObject({
      classification: "INTENTIONALLY_FROZEN",
      policyVersion: "reproducibility-v1",
      schemaVersion: "releaseproof-case-v2",
      predecessor: "0x946BC9B19BD971CBefb56845b5825FB7B9f6b183",
      successor: null,
    });
  });

  it("promotes a v1 manifest without changing any historical field", () => {
    const current = {
      network: "studionet" as const,
      contractAddress: "0x946BC9B19BD971CBefb56845b5825FB7B9f6b183",
      deploymentTransactionHash: `0x${"b".repeat(64)}`,
      explorerUrl: `https://explorer-studio.genlayer.com/tx/0x${"b".repeat(64)}`,
      sourceSha256: "c".repeat(64),
      deployerAddress: `0x${"d".repeat(40)}`,
      deployedAt: "2026-08-23T03:35:26.160095+00:00",
      policyVersion: "reproducibility-v1" as const,
      schemaVersion: "releaseproof-case-v1" as const,
      classification: "INTENTIONALLY_FROZEN" as const,
      predecessor: "0x10aE8E49717D9E90398F9E783bf6db7d25Be1A69",
      successor: null,
    };
    const successor = `0x${"e".repeat(40)}`;

    expect(buildPredecessorManifest(current, successor)).toEqual({
      ...current,
      successor,
    });
    expect(current.successor).toBeNull();
  });

  it.each([
    ["schemaVersion", "releaseproof-case-v1"],
    ["policyVersion", "other-policy"],
    ["predecessor", `0x${"f".repeat(40)}`],
  ])("rejects an invalid v2 %s", (field, value) => {
    expect(() => buildManifest({ ...validInput, [field]: value })).toThrow();
  });

  it("rejects malformed non-null predecessor and successor addresses", () => {
    expect(() => buildManifest({ ...validInput, predecessor: "not-an-address" })).toThrow();
    expect(() => buildManifest({ ...validInput, successor: "not-an-address" })).toThrow();
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
