import { localnet, studionet } from "genlayer-js/chains";

import type { ContractAddress } from "./types";


const addressPattern = /^0x[0-9a-fA-F]{40}$/;

export function requireContractAddress(value: string | undefined): ContractAddress {
  if (!value) {
    throw new Error("Contract address is not configured");
  }
  if (!addressPattern.test(value)) {
    throw new Error("Contract address is invalid");
  }
  return value as ContractAddress;
}

export function configuredContractAddress(): ContractAddress {
  return requireContractAddress(import.meta.env.VITE_GENLAYER_CONTRACT_ADDRESS);
}

export function requireRpcEndpoint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const endpoint = new URL(value);
  if (!(["http:", "https:"] as string[]).includes(endpoint.protocol)) {
    throw new Error("GenLayer RPC endpoint must use HTTP or HTTPS");
  }
  return endpoint.toString();
}

export function configuredEndpoint(): string | undefined {
  return requireRpcEndpoint(import.meta.env.VITE_GENLAYER_RPC_URL);
}

export function configuredNetworkName(): "localnet" | "studionet" {
  const network = import.meta.env.VITE_GENLAYER_NETWORK ?? "studionet";
  if (network !== "localnet" && network !== "studionet") {
    throw new Error(`Unsupported GenLayer network: ${network}`);
  }
  return network;
}

export function configuredChain() {
  return configuredNetworkName() === "localnet" ? localnet : studionet;
}
