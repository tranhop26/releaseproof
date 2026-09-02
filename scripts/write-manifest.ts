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
  schemaVersion: "releaseproof-case-v2";
  policyVersion: "reproducibility-v1";
  predecessor: string;
  successor?: string | null;
}

export interface ManifestRecord {
  network: "studionet";
  contractAddress: string;
  deploymentTransactionHash: string;
  explorerUrl: string;
  sourceSha256: string;
  deployerAddress: string;
  deployedAt: string;
  policyVersion: string;
  schemaVersion: string;
  classification: "INTENTIONALLY_FROZEN";
  predecessor: string | null;
  successor: string | null;
}

export const EXPECTED_PREDECESSOR = "0x946BC9B19BD971CBefb56845b5825FB7B9f6b183";
export const V2_SCHEMA_VERSION = "releaseproof-case-v2";
export const POLICY_VERSION = "reproducibility-v1";

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const transactionPattern = /^0x[0-9a-fA-F]{64}$/;
const digestPattern = /^[0-9a-f]{64}$/;

function validateNullableAddress(name: string, value: string | null | undefined) {
  if (value !== null && value !== undefined && !addressPattern.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
}

export function buildManifest(input: ManifestInput): ManifestRecord {
  if (!addressPattern.test(input.contractAddress)) throw new Error("Invalid contract address");
  if (!transactionPattern.test(input.deploymentTransactionHash)) {
    throw new Error("Invalid deployment transaction hash");
  }
  if (!digestPattern.test(input.sourceSha256)) throw new Error("Invalid source SHA-256");
  if (!addressPattern.test(input.deployerAddress)) throw new Error("Invalid deployer address");
  if (input.schemaVersion !== V2_SCHEMA_VERSION) throw new Error("Invalid schema version");
  if (input.policyVersion !== POLICY_VERSION) throw new Error("Invalid policy version");
  if (input.predecessor !== EXPECTED_PREDECESSOR) {
    throw new Error("Invalid predecessor address");
  }
  validateNullableAddress("successor address", input.successor);
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
    policyVersion: input.policyVersion,
    schemaVersion: input.schemaVersion,
    classification: "INTENTIONALLY_FROZEN",
    predecessor: input.predecessor,
    successor: input.successor ?? null,
  } as const;
}

export function buildPredecessorManifest(
  current: ManifestRecord,
  successorAddress: string | null,
): ManifestRecord {
  validateNullableAddress("predecessor address", current.predecessor);
  validateNullableAddress("successor address", current.successor);
  validateNullableAddress("successor address", successorAddress);
  return {
    ...current,
    successor: successorAddress,
  };
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
  return writeManifestRecordAtomically(path, manifest);
}

export async function writeManifestRecordAtomically(path: string, manifest: ManifestRecord) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, path);
  return manifest;
}
