import type { CaseRecord, TransactionHash } from "./types";


export interface ReceiptShape {
  statusName?: string;
  txExecutionResultName?: string;
}

export interface ReconciliationApi {
  waitForReceipt(hash: TransactionHash): Promise<unknown>;
  readCase(caseId: number): Promise<CaseRecord>;
}

export type Reconciliation =
  | { phase: "pending"; hash: TransactionHash }
  | { phase: "finalized"; hash: TransactionHash }
  | { phase: "execution_error"; hash: TransactionHash; executionResult: string }
  | { phase: "readback"; hash: TransactionHash; case: CaseRecord };

export async function reconcileTransaction(
  api: ReconciliationApi,
  hash: TransactionHash,
  expectedCaseId?: number,
): Promise<Reconciliation> {
  const receipt = (await api.waitForReceipt(hash)) as ReceiptShape;
  if (receipt.statusName !== "FINALIZED") {
    return { phase: "pending", hash };
  }
  if (receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    return {
      phase: "execution_error",
      hash,
      executionResult: receipt.txExecutionResultName ?? "UNKNOWN",
    };
  }
  if (expectedCaseId === undefined) {
    return { phase: "finalized", hash };
  }
  return { phase: "readback", hash, case: await api.readCase(expectedCaseId) };
}
