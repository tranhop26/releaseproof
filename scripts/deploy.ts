import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

import { verifyDeployment } from "./verify-deployment";
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

export async function readCurrentV1Manifest(path = currentManifestPath): Promise<ManifestRecord> {
  const current = JSON.parse(await readFile(path, "utf8")) as ManifestRecord;
  if (current.schemaVersion !== "releaseproof-case-v1") {
    throw new Error("Current manifest must be the releaseproof-case-v1 manifest");
  }
  if (current.contractAddress !== EXPECTED_PREDECESSOR) {
    throw new Error("Current manifest contract address does not match expected predecessor");
  }
  return current;
}

export async function deployVerifiedSuccessor() {
  const current = await readCurrentV1Manifest();
  const privateKey = process.env.GENLAYER_DEPLOYER_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("GENLAYER_DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte key");
  }
  const sourcePath = resolve("contracts/releaseproof.py");
  const source = await readFile(sourcePath, "utf8");
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

  const verified = await verifyDeployment(client, contractAddress, source);
  const explorerBase = studionet.blockExplorers?.default.url.replace(/\/$/, "");
  if (!explorerBase) throw new Error("Studionet explorer is not configured");
  const manifestInput: ManifestInput = {
    network: "studionet" as const,
    contractAddress,
    deploymentTransactionHash,
    explorerUrl: `${explorerBase}/transactions/${deploymentTransactionHash}`,
    sourceSha256: verified.sourceSha256,
    deployerAddress: account.address,
    deployedAt: new Date().toISOString(),
    schemaVersion: "releaseproof-case-v2",
    policyVersion: "reproducibility-v1",
    predecessor: EXPECTED_PREDECESSOR,
  };
  // These objects are prepared only after source, schema, and initial readback
  // verification. The historical copy is written first so an interrupted
  // promotion never loses the verified successor link.
  const successorManifest = buildManifest(manifestInput);
  const predecessorManifest = buildPredecessorManifest(current, contractAddress);
  await writeManifestRecordAtomically(resolve("deployments/studionet-v1.json"), predecessorManifest);
  await writeManifestAtomically(currentManifestPath, manifestInput);
  console.info("Deployment verified", deploymentLogFields(manifestInput));
  return { successorManifest, predecessorManifest } as const;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  deployVerifiedSuccessor().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Deployment failed");
    process.exitCode = 1;
  });
}
