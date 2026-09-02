const STUDIONET_EXPLORER_BASE = "https://explorer-studio.genlayer.com";
const transactionPattern = /^0x[0-9a-fA-F]{64}$/;

export function buildStudionetTransactionExplorerUrl(transactionHash: string): string {
  if (!transactionPattern.test(transactionHash)) {
    throw new Error("Deployment transaction hash is invalid");
  }

  return `${STUDIONET_EXPLORER_BASE}/tx/${transactionHash}`;
}
