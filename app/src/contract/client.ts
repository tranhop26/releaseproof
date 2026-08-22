import { createClient as createGenLayerClient } from "genlayer-js";

import { configuredChain, requireContractAddress } from "./config";
import {
  caseRecordSchema,
  submissionInputSchema,
  type CaseRecord,
  type ContractAddress,
  type SubmissionInput,
  type TransactionHash,
} from "./types";


export interface WalletProvider {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}

export interface ContractClientLike {
  writeContract(args: {
    address: ContractAddress;
    functionName: string;
    args: unknown[];
    value: bigint;
  }): Promise<unknown>;
  readContract(args: {
    address: ContractAddress;
    functionName: string;
    args: unknown[];
  }): Promise<unknown>;
  waitForTransactionReceipt(args: {
    hash: TransactionHash;
    waitUntil: "finalized";
  }): Promise<unknown>;
}

function requireHash(value: unknown): TransactionHash {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error("Contract write did not return a transaction hash");
  }
  return value as TransactionHash;
}

export function createReadClient(): ContractClientLike {
  return createGenLayerClient({ chain: configuredChain() }) as ContractClientLike;
}

export function createWalletClient(
  address: string,
  provider: WalletProvider,
): ContractClientLike {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Wallet address is invalid");
  }
  return createGenLayerClient({
    chain: configuredChain(),
    account: address as ContractAddress,
    provider: provider as never,
  }) as ContractClientLike;
}

export function createReleaseProofApi(
  client: ContractClientLike,
  contractAddress: string | undefined,
) {
  const address = requireContractAddress(contractAddress);

  return {
    async submitCase(input: SubmissionInput): Promise<TransactionHash> {
      const parsed = submissionInputSchema.parse(input);
      return requireHash(
        await client.writeContract({
          address,
          functionName: "submit_case",
          args: [
            parsed.repository,
            parsed.commitSha,
            parsed.artifactPath,
            parsed.evidenceHash,
          ],
          value: 0n,
        }),
      );
    },

    async resolveCase(caseId: number): Promise<TransactionHash> {
      if (!Number.isSafeInteger(caseId) || caseId < 1) {
        throw new Error("Case ID is invalid");
      }
      return requireHash(
        await client.writeContract({
          address,
          functionName: "resolve_case",
          args: [caseId],
          value: 0n,
        }),
      );
    },

    async readCase(caseId: number): Promise<CaseRecord> {
      const raw = await client.readContract({
        address,
        functionName: "get_case",
        args: [caseId],
      });
      if (typeof raw !== "string") {
        throw new Error("Contract returned invalid case readback");
      }
      return caseRecordSchema.parse(JSON.parse(raw) as unknown);
    },

    async getCaseIdByBinding(binding: string): Promise<number> {
      const raw = await client.readContract({
        address,
        functionName: "get_case_id_by_binding",
        args: [binding],
      });
      const value = typeof raw === "bigint" ? Number(raw) : Number(raw);
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("Contract returned invalid case ID");
      }
      return value;
    },

    waitForReceipt(hash: TransactionHash) {
      return client.waitForTransactionReceipt({ hash, waitUntil: "finalized" });
    },
  };
}

export type ReleaseProofApi = ReturnType<typeof createReleaseProofApi>;
