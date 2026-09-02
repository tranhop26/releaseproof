import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { verifyDeployment } from "./verify-deployment";


function clientFor(
  deployedSource: string,
  deployedSchema: unknown = { read: ["get_case_count"] },
  caseCount = 0,
) {
  return {
    getContractCode: vi.fn().mockResolvedValue(deployedSource),
    getContractSchema: vi.fn().mockResolvedValue(deployedSchema),
    getContractSchemaForCode: vi.fn().mockResolvedValue({ read: ["get_case_count"] }),
    readContract: vi.fn().mockResolvedValue(caseCount),
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

  it("rejects a deployed schema that differs from the v2 source schema", async () => {
    await expect(
      verifyDeployment(
        clientFor("class ReleaseProof:\n    pass\n", { read: ["legacy_method"] }),
        "0x1111111111111111111111111111111111111111",
        "class ReleaseProof:\n    pass\n",
      ),
    ).rejects.toThrow("Deployed schema does not match local schema");
  });

  it("rejects a non-empty initial v2 readback", async () => {
    await expect(
      verifyDeployment(
        clientFor("class ReleaseProof:\n    pass\n", undefined, 1),
        "0x1111111111111111111111111111111111111111",
        "class ReleaseProof:\n    pass\n",
      ),
    ).rejects.toThrow("Initial contract readback is not empty");
  });
});
