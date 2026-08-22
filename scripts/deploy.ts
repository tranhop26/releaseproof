import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

import { verifyDeployment } from "./verify-deployment";
import { deploymentLogFields, writeManifestAtomically } from "./write-manifest";


async function main() {
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
  const manifestInput = {
    network: "studionet" as const,
    contractAddress,
    deploymentTransactionHash,
    explorerUrl: `${explorerBase}/transactions/${deploymentTransactionHash}`,
    sourceSha256: verified.sourceSha256,
    deployerAddress: account.address,
    deployedAt: new Date().toISOString(),
  };
  await writeManifestAtomically(resolve("deployments/studionet.json"), manifestInput);
  console.info("Deployment verified", deploymentLogFields(manifestInput));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Deployment failed");
  process.exitCode = 1;
});
