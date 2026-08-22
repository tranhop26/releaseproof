import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";


export interface ManifestInput {
  network: "studionet";
  contractAddress: string;
  deploymentTransactionHash: string;
  explorerUrl: string;
  sourceSha256: string;
  deployerAddress: string;
  deployedAt: string;
  predecessor?: string | null;
  successor?: string | null;
}

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const transactionPattern = /^0x[0-9a-fA-F]{64}$/;
const digestPattern = /^[0-9a-f]{64}$/;

export function buildManifest(input: ManifestInput) {
  if (!addressPattern.test(input.contractAddress)) throw new Error("Invalid contract address");
  if (!transactionPattern.test(input.deploymentTransactionHash)) {
    throw new Error("Invalid deployment transaction hash");
  }
  if (!digestPattern.test(input.sourceSha256)) throw new Error("Invalid source SHA-256");
  if (!addressPattern.test(input.deployerAddress)) throw new Error("Invalid deployer address");
  if (!input.explorerUrl.startsWith("https://")) throw new Error("Invalid explorer URL");
  if (Number.isNaN(Date.parse(input.deployedAt))) throw new Error("Invalid deployment timestamp");

  return {
    network: input.network,
    contractAddress: input.contractAddress,
    deploymentTransactionHash: input.deploymentTransactionHash,
    explorerUrl: input.explorerUrl,
    sourceSha256: input.sourceSha256,
    deployerAddress: input.deployerAddress,
    deployedAt: input.deployedAt,
    policyVersion: "reproducibility-v1",
    schemaVersion: "releaseproof-case-v1",
    classification: "INTENTIONALLY_FROZEN",
    predecessor: input.predecessor ?? null,
    successor: input.successor ?? null,
  } as const;
}

export function deploymentLogFields(input: ManifestInput) {
  return {
    network: input.network,
    contractAddress: input.contractAddress,
    deploymentTransactionHash: input.deploymentTransactionHash,
    status: "verified",
  } as const;
}

export async function writeManifestAtomically(path: string, input: ManifestInput) {
  const manifest = buildManifest(input);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, path);
  return manifest;
}
