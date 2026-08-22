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

export function configuredChain() {
  const network = import.meta.env.VITE_GENLAYER_NETWORK ?? "studionet";
  if (network === "localnet") {
    return localnet;
  }
  if (network !== "studionet") {
    throw new Error(`Unsupported GenLayer network: ${network}`);
  }
  return studionet;
}
