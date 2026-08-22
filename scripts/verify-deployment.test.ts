import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { verifyDeployment } from "./verify-deployment";


function clientFor(deployedSource: string) {
  const schema = { read: ["get_case_count"] };
  return {
    getContractCode: vi.fn().mockResolvedValue(deployedSource),
    getContractSchema: vi.fn().mockResolvedValue(schema),
    getContractSchemaForCode: vi.fn().mockResolvedValue(schema),
    readContract: vi.fn().mockResolvedValue(0),
  };
}

describe("verifyDeployment", () => {
  it("accepts Studio CRLF normalization and hashes the deployed source", async () => {
    const localSource = "# v0.2.16\nclass ReleaseProof:\n    pass\n";
    const deployedSource = localSource.replaceAll("\n", "\r\n");

    const result = await verifyDeployment(
      clientFor(deployedSource),
      "0x1111111111111111111111111111111111111111",
      localSource,
    );

    expect(result.sourceSha256).toBe(
      createHash("sha256").update(deployedSource).digest("hex"),
    );
  });

  it("rejects a semantic source mismatch", async () => {
    await expect(
      verifyDeployment(
        clientFor("class Different:\n    pass\n"),
        "0x1111111111111111111111111111111111111111",
        "class ReleaseProof:\n    pass\n",
      ),
    ).rejects.toThrow("Deployed source does not match local source");
  });
});
