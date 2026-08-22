import { describe, expect, it, vi } from "vitest";

import { createReleaseProofApi } from "./client";


const address = `0x${"a".repeat(40)}` as const;
const hash = `0x${"b".repeat(64)}` as const;

describe("ReleaseProof contract client", () => {
  it("rejects an unconfigured address instead of substituting fake data", () => {
    expect(() => createReleaseProofApi({} as never, "")).toThrow(
      "Contract address is not configured",
    );
  });

  it("submits exactly one contract write", async () => {
    const client = {
      writeContract: vi.fn().mockResolvedValue(hash),
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    };
    const api = createReleaseProofApi(client, address);

    await expect(
      api.submitCase({
        repository: "openscience/trial-a",
        commitSha: "a".repeat(40),
        artifactPath: "reports/reproduction.md",
        evidenceHash: "b".repeat(64),
      }),
    ).resolves.toBe(hash);
    expect(client.writeContract).toHaveBeenCalledTimes(1);
    expect(client.writeContract).toHaveBeenCalledWith({
      address,
      functionName: "submit_case",
      args: [
        "openscience/trial-a",
        "a".repeat(40),
        "reports/reproduction.md",
        "b".repeat(64),
      ],
      value: 0n,
    });
  });
});
