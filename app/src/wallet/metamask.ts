import type { WalletProvider } from "../contract/client";


const GENLAYER_SNAP_ID = "npm:genlayer-wallet-plugin";

export interface MetaMaskProvider extends WalletProvider {
  isMetaMask?: boolean;
  providers?: MetaMaskProvider[];
}

export interface ConnectedMetaMask {
  address: string;
  provider: MetaMaskProvider;
}

export interface MetaMaskChain {
  id: number;
  name: string;
  rpcUrls: { default: { http: readonly string[] } };
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorers?: { default: { url: string } };
}

declare global {
  interface Window {
    ethereum?: MetaMaskProvider;
  }
}

function errorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const value = (error as { code?: unknown }).code;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return undefined;
}

export function walletErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 4001) {
    return "MetaMask request was rejected. Approve the request and try again.";
  }
  if (code === -32002) {
    return "MetaMask already has a pending request. Open MetaMask and complete it.";
  }
  if (code === 4200 || code === -32601) {
    return "MetaMask does not support the requested method. Update desktop MetaMask and try again.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "MetaMask connection failed. Open MetaMask and try again.";
}

export function selectMetaMaskProvider(
  injected: MetaMaskProvider | undefined,
): MetaMaskProvider {
  const candidates = injected?.providers?.length
    ? injected.providers
    : injected
      ? [injected]
      : [];
  const selected = candidates.find((candidate) => candidate.isMetaMask === true);
  if (!selected) {
    throw new Error(
      "MetaMask was not found. Install and unlock desktop MetaMask, then reload this page.",
    );
  }
  return selected;
}

async function ensureNetwork(provider: MetaMaskProvider, chain: MetaMaskChain) {
  const chainId = `0x${chain.id.toString(16)}`;
  if (await provider.request({ method: "eth_chainId" }) === chainId) return;

  const switchNetwork = () => provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId }],
  });
  try {
    await switchNetwork();
  } catch (error) {
    if (errorCode(error) !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: chain.name,
        rpcUrls: [...chain.rpcUrls.default.http],
        nativeCurrency: chain.nativeCurrency,
        blockExplorerUrls: chain.blockExplorers?.default
          ? [chain.blockExplorers.default.url]
          : [],
      }],
    });
    await switchNetwork();
  }
}

async function ensureSnap(provider: MetaMaskProvider) {
  const installed = await provider.request({ method: "wallet_getSnaps" });
  const snaps = installed && typeof installed === "object"
    ? Object.values(installed)
    : [];
  const isReady = (snap: unknown) => (
    snap
    && typeof snap === "object"
    && (snap as { id?: unknown }).id === GENLAYER_SNAP_ID
    && (snap as { enabled?: unknown }).enabled !== false
    && (snap as { blocked?: unknown }).blocked !== true
  );
  if (snaps.some(isReady)) return;

  const approved = await provider.request({
    method: "wallet_requestSnaps",
    params: { [GENLAYER_SNAP_ID]: {} },
  });
  const approvedSnaps = approved && typeof approved === "object"
    ? Object.values(approved)
    : [];
  if (!approvedSnaps.some(isReady)) {
    throw new Error("MetaMask did not enable the GenLayer Snap.");
  }
}

export async function connectMetaMask(
  injected: MetaMaskProvider | undefined,
  chain: MetaMaskChain,
): Promise<ConnectedMetaMask> {
  const provider = selectMetaMaskProvider(injected);
  let accounts: unknown;
  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (error) {
    throw new Error(
      `MetaMask account access failed: ${walletErrorMessage(error)}`,
      { cause: error },
    );
  }
  if (
    !Array.isArray(accounts)
    || typeof accounts[0] !== "string"
    || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])
  ) {
    throw new Error("MetaMask did not return a valid account.");
  }

  try {
    await ensureNetwork(provider, chain);
  } catch (error) {
    throw new Error(
      `MetaMask network setup failed: ${walletErrorMessage(error)}`,
      { cause: error },
    );
  }
  try {
    await ensureSnap(provider);
  } catch (error) {
    throw new Error(
      `GenLayer Snap setup failed: ${walletErrorMessage(error)}`,
      { cause: error },
    );
  }
  const currentAccounts = await provider.request({ method: "eth_accounts" });
  if (
    !Array.isArray(currentAccounts)
    || typeof currentAccounts[0] !== "string"
    || currentAccounts[0].toLowerCase() !== accounts[0].toLowerCase()
  ) {
    throw new Error(
      "MetaMask account changed during connection. Reconnect to continue safely.",
    );
  }
  return { address: accounts[0], provider };
}
