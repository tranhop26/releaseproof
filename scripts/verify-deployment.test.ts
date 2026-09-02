import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";

import { deployVerifiedSuccessor } from "./deploy";
import { verifyDeployment } from "./verify-deployment";

type ManifestFixture = Record<string, unknown>;

async function withManifestFixtures(
  mutate: (current: ManifestFixture, historical: ManifestFixture) => void,
  assertion: (currentPath: string, historicalPath: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "releaseproof-manifest-"));
  const currentPath = join(directory, "studionet.json");
  const historicalPath = join(directory, "studionet-v1.json");
  const current = JSON.parse(await readFile(resolve("deployments/studionet.json"), "utf8")) as ManifestFixture;
  const historical = JSON.parse(await readFile(resolve("deployments/studionet-v1.json"), "utf8")) as ManifestFixture;
  mutate(current, historical);
  await writeFile(currentPath, `${JSON.stringify(current)}\n`, "utf8");
  await writeFile(historicalPath, `${JSON.stringify(historical)}\n`, "utf8");
  try {
    await assertion(currentPath, historicalPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}


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

  it("rejects a malformed current manifest before invoking deployment", async () => {
    await withManifestFixtures(
      (current) => { delete current.sourceSha256; },
      async (currentPath, historicalPath) => {
        const runDeployment = vi.fn();
        await expect(
          deployVerifiedSuccessor({ currentManifestPath: currentPath, historicalManifestPath: historicalPath, runDeployment }),
        ).rejects.toThrow("Current manifest sourceSha256 is missing or invalid");
        expect(runDeployment).not.toHaveBeenCalled();
      },
    );
  });

  it("rejects a malformed historical manifest before invoking deployment", async () => {
    await withManifestFixtures(
      (_current, historical) => { delete historical.policyVersion; },
      async (currentPath, historicalPath) => {
        const runDeployment = vi.fn();
        await expect(
          deployVerifiedSuccessor({ currentManifestPath: currentPath, historicalManifestPath: historicalPath, runDeployment }),
        ).rejects.toThrow("Historical manifest policyVersion is missing or invalid");
        expect(runDeployment).not.toHaveBeenCalled();
      },
    );
  });

  it("rejects a tampered current manifest before invoking deployment", async () => {
    await withManifestFixtures(
      (current) => { current.sourceSha256 = "0".repeat(64); },
      async (currentPath, historicalPath) => {
        const runDeployment = vi.fn();
        await expect(
          deployVerifiedSuccessor({ currentManifestPath: currentPath, historicalManifestPath: historicalPath, runDeployment }),
        ).rejects.toThrow("Current v1 manifest differs from historical baseline");
        expect(runDeployment).not.toHaveBeenCalled();
      },
    );
  });

  it("rejects a tampered historical baseline before invoking deployment", async () => {
    await withManifestFixtures(
      (_current, historical) => { historical.deployerAddress = `0x${"f".repeat(40)}`; },
      async (currentPath, historicalPath) => {
        const runDeployment = vi.fn();
        await expect(
          deployVerifiedSuccessor({ currentManifestPath: currentPath, historicalManifestPath: historicalPath, runDeployment }),
        ).rejects.toThrow("Current v1 manifest differs from historical baseline");
        expect(runDeployment).not.toHaveBeenCalled();
      },
    );
  });

  it("fails closed on an interrupted promotion before invoking deployment", async () => {
    await withManifestFixtures(
      (_current, historical) => { historical.successor = `0x${"e".repeat(40)}`; },
      async (currentPath, historicalPath) => {
        const runDeployment = vi.fn();
        await expect(
          deployVerifiedSuccessor({ currentManifestPath: currentPath, historicalManifestPath: historicalPath, runDeployment }),
        ).rejects.toThrow("Historical v1 promotion is already in progress");
        expect(runDeployment).not.toHaveBeenCalled();
      },
    );
  });

  it.each([
    "deploymentTransactionHash",
    "sourceSha256",
    "deployerAddress",
    "policyVersion",
    "classification",
    "predecessor",
    "successor",
  ] as const)("rejects manifests missing required %s before invoking deployment", async (field) => {
    await withManifestFixtures(
      (current, historical) => {
        delete current[field];
        delete historical[field];
      },
      async (currentPath, historicalPath) => {
        const runDeployment = vi.fn().mockRejectedValue(new Error("deployment started"));
        await expect(
          deployVerifiedSuccessor({ currentManifestPath: currentPath, historicalManifestPath: historicalPath, runDeployment }),
        ).rejects.toThrow(`Current manifest ${field} is missing or invalid`);
        expect(runDeployment).not.toHaveBeenCalled();
      },
    );
  });

  it("writes the authoritative Studionet transaction explorer URL into the successor manifest", async () => {
    await withManifestFixtures(
      () => {},
      async (currentPath, historicalPath) => {
        const localSource = await readFile(resolve("contracts/releaseproof.py"), "utf8");
        const deploymentTransactionHash = `0x${"1".repeat(64)}` as const;

        const { successorManifest } = await deployVerifiedSuccessor({
          currentManifestPath: currentPath,
          historicalManifestPath: historicalPath,
          runDeployment: async () => ({
            client: clientFor(localSource),
            contractAddress: `0x${"2".repeat(40)}` as const,
            deploymentTransactionHash,
            deployerAddress: `0x${"3".repeat(40)}` as const,
          }),
        });

        expect(successorManifest.explorerUrl).toBe(
          `https://explorer-studio.genlayer.com/tx/${deploymentTransactionHash}`,
        );
      },
    );
  });
});
