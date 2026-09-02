import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

import { buildStudionetTransactionExplorerUrl } from "./explorer-url";
import { verifyDeployment, type VerificationClient } from "./verify-deployment";
import {
  EXPECTED_PREDECESSOR,
  buildManifest,
  buildPredecessorManifest,
  deploymentLogFields,
  writeManifestAtomically,
  writeManifestRecordAtomically,
  type ManifestInput,
  type ManifestRecord,
} from "./write-manifest";

const currentManifestPath = resolve("deployments/studionet.json");
const historicalManifestPath = resolve("deployments/studionet-v1.json");
const v1SchemaVersion = "releaseproof-case-v1";
const v1PolicyVersion = "reproducibility-v1";
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const transactionPattern = /^0x[0-9a-fA-F]{64}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const manifestIdentityFields = [
  "network",
  "contractAddress",
  "deploymentTransactionHash",
  "explorerUrl",
  "sourceSha256",
  "deployerAddress",
  "deployedAt",
  "policyVersion",
  "schemaVersion",
  "classification",
  "predecessor",
] as const;

function sameManifestIdentity(current: ManifestRecord, historical: ManifestRecord) {
  return manifestIdentityFields.every((field) => current[field] === historical[field]);
}

function requireManifestObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} manifest is not an object`);
  }
  return value as Record<string, unknown>;
}

function readStringField(
  manifest: Record<string, unknown>,
  manifestName: string,
  field: keyof ManifestRecord,
  pattern?: RegExp,
) {
  const value = manifest[field];
  if (typeof value !== "string" || (pattern && !pattern.test(value))) {
    throw new Error(`${manifestName} manifest ${field} is missing or invalid`);
  }
  return value;
}

function readSuccessorField(manifest: Record<string, unknown>, manifestName: string) {
  const value = manifest.successor;
  if (value !== null && (typeof value !== "string" || !addressPattern.test(value))) {
    throw new Error(`${manifestName} manifest successor is missing or invalid`);
  }
  if (!Object.hasOwn(manifest, "successor")) {
    throw new Error(`${manifestName} manifest successor is missing or invalid`);
  }
  return value;
}

function parseV1Manifest(value: unknown, manifestName: string): ManifestRecord {
  const manifest = requireManifestObject(value, manifestName);
  const network = readStringField(manifest, manifestName, "network");
  const contractAddress = readStringField(manifest, manifestName, "contractAddress", addressPattern);
  const deploymentTransactionHash = readStringField(
    manifest,
    manifestName,
    "deploymentTransactionHash",
    transactionPattern,
  );
  const explorerUrl = readStringField(manifest, manifestName, "explorerUrl");
  const sourceSha256 = readStringField(manifest, manifestName, "sourceSha256", digestPattern);
  const deployerAddress = readStringField(manifest, manifestName, "deployerAddress", addressPattern);
  const deployedAt = readStringField(manifest, manifestName, "deployedAt");
  const policyVersion = readStringField(manifest, manifestName, "policyVersion");
  const schemaVersion = readStringField(manifest, manifestName, "schemaVersion");
  const classification = readStringField(manifest, manifestName, "classification");
  const predecessor = readStringField(manifest, manifestName, "predecessor", addressPattern);
  const successor = readSuccessorField(manifest, manifestName);

  if (network !== "studionet") throw new Error(`${manifestName} manifest network is missing or invalid`);
  if (!explorerUrl.startsWith("https://")) {
    throw new Error(`${manifestName} manifest explorerUrl is missing or invalid`);
  }
  if (Number.isNaN(Date.parse(deployedAt))) {
    throw new Error(`${manifestName} manifest deployedAt is missing or invalid`);
  }
  if (policyVersion !== v1PolicyVersion) {
    throw new Error(`${manifestName} manifest policyVersion is missing or invalid`);
  }
  if (schemaVersion !== v1SchemaVersion) {
    throw new Error(`${manifestName} manifest schemaVersion is missing or invalid`);
  }
  if (classification !== "INTENTIONALLY_FROZEN") {
    throw new Error(`${manifestName} manifest classification is missing or invalid`);
  }

  return {
    network: "studionet",
    contractAddress,
    deploymentTransactionHash,
    explorerUrl,
    sourceSha256,
    deployerAddress,
    deployedAt,
    policyVersion,
    schemaVersion,
    classification: "INTENTIONALLY_FROZEN",
    predecessor,
    successor,
  };
}

export async function readCurrentV1Manifest(
  path = currentManifestPath,
  baselinePath = historicalManifestPath,
): Promise<ManifestRecord> {
  const [currentText, baselineText] = await Promise.all([
    readFile(path, "utf8"),
    readFile(baselinePath, "utf8"),
  ]);
  const current = parseV1Manifest(JSON.parse(currentText) as unknown, "Current");
  const historical = parseV1Manifest(JSON.parse(baselineText) as unknown, "Historical");
  if (current.contractAddress !== EXPECTED_PREDECESSOR) {
    throw new Error("Current manifest contract address does not match expected predecessor");
  }
  if (historical.contractAddress !== EXPECTED_PREDECESSOR) {
    throw new Error("Historical manifest contract address does not match expected predecessor");
  }
  if (historical.successor !== null) {
    throw new Error("Historical v1 promotion is already in progress");
  }
  if (current.successor !== null) {
    throw new Error("Current v1 manifest already has a successor");
  }
  if (!sameManifestIdentity(current, historical)) {
    throw new Error("Current v1 manifest differs from historical baseline");
  }
  return current;
}

export interface DeploymentResult {
  client: VerificationClient;
  deploymentTransactionHash: string;
  contractAddress: `0x${string}`;
  deployerAddress: string;
}

export type DeploymentRunner = (source: string) => Promise<DeploymentResult>;

async function runStudionetDeployment(source: string): Promise<DeploymentResult> {
  const privateKey = process.env.GENLAYER_DEPLOYER_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("GENLAYER_DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte key");
  }
  const account = createAccount(privateKey as `0x${string}`);
  const client = createClient({ chain: studionet, account });

  const deploymentTransactionHash = await client.deployContract({ code: source, args: [] });
  console.info("Deployment submitted", {
    network: "studionet",
    deployerAddress: account.address,
    deploymentTransactionHash,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: deploymentTransactionHash as never,
    status: TransactionStatus.FINALIZED,
  });
  if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
    throw new Error(`Deployment execution failed: ${receipt.txExecutionResultName ?? "unknown"}`);
  }
  const decoded = receipt.txDataDecoded;
  const contractAddress = decoded && "contractAddress" in decoded
    ? decoded.contractAddress
    : undefined;
  if (!contractAddress) throw new Error("Finalized deployment receipt has no contract address");

  return {
    client,
    deploymentTransactionHash,
    contractAddress: contractAddress as `0x${string}`,
    deployerAddress: account.address,
  };
}

export interface DeploymentOptions {
  currentManifestPath?: string;
  historicalManifestPath?: string;
  runDeployment?: DeploymentRunner;
}

export async function deployVerifiedSuccessor(options: DeploymentOptions = {}) {
  const currentPath = options.currentManifestPath ?? currentManifestPath;
  const baselinePath = options.historicalManifestPath ?? historicalManifestPath;
  const current = await readCurrentV1Manifest(currentPath, baselinePath);
  const sourcePath = resolve("contracts/releaseproof.py");
  const source = await readFile(sourcePath, "utf8");
  const deployment = await (options.runDeployment ?? runStudionetDeployment)(source);

  const verified = await verifyDeployment(deployment.client, deployment.contractAddress, source);
  const manifestInput: ManifestInput = {
    network: "studionet" as const,
    contractAddress: deployment.contractAddress,
    deploymentTransactionHash: deployment.deploymentTransactionHash,
    explorerUrl: buildStudionetTransactionExplorerUrl(deployment.deploymentTransactionHash),
    sourceSha256: verified.sourceSha256,
    deployerAddress: deployment.deployerAddress,
    deployedAt: new Date().toISOString(),
    schemaVersion: "releaseproof-case-v2",
    policyVersion: "reproducibility-v1",
    predecessor: EXPECTED_PREDECESSOR,
  };
  // These objects are prepared only after source, schema, and initial readback
  // verification. The historical copy is written first so an interrupted
  // promotion never loses the verified successor link.
  const successorManifest = buildManifest(manifestInput);
  const predecessorManifest = buildPredecessorManifest(current, deployment.contractAddress);
  await writeManifestRecordAtomically(baselinePath, predecessorManifest);
  await writeManifestAtomically(currentPath, manifestInput);
  console.info("Deployment verified", deploymentLogFields(manifestInput));
  return { successorManifest, predecessorManifest } as const;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  deployVerifiedSuccessor().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Deployment failed");
    process.exitCode = 1;
  });
}
