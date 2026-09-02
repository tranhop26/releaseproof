import { describe, expect, it, vi } from "vitest";
import { studionet } from "genlayer-js/chains";

import {
  connectMetaMask,
  selectMetaMaskProvider,
  walletErrorMessage,
  type MetaMaskProvider,
} from "./metamask";


const address = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";
const snapId = "npm:genlayer-wallet-plugin";

function provider(
  responses: Record<string, unknown>,
  isMetaMask = true,
): MetaMaskProvider {
  return {
    isMetaMask,
    request: vi.fn(async ({ method }) => {
      if (!(method in responses)) {
        throw new Error(`Unexpected wallet method: ${method}`);
      }
      return responses[method];
    }),
  };
}

describe("selectMetaMaskProvider", () => {
  it("selects MetaMask from a multi-provider injection", () => {
    const other = provider({}, false);
    const metamask = provider({});

    expect(selectMetaMaskProvider({
      ...other,
      providers: [other, metamask],
    })).toBe(metamask);
  });

  it("rejects an injection that does not contain MetaMask", () => {
    expect(() => selectMetaMaskProvider(provider({}, false))).toThrow(
      "MetaMask was not found",
    );
  });
});

describe("connectMetaMask", () => {
  it("switches an existing network without trying to add it", async () => {
    const metamask = provider({
      eth_requestAccounts: [address],
      eth_chainId: "0x1",
      wallet_switchEthereumChain: null,
      wallet_getSnaps: { [snapId]: { id: snapId } },
    });

    await expect(connectMetaMask(metamask, studionet)).resolves.toEqual({
      address,
      provider: metamask,
    });
    expect(metamask.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xf22f" }],
    });
    expect(metamask.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "wallet_addEthereumChain" }),
    );
  });

  it("adds an unknown network and retries the switch", async () => {
    let switchCalls = 0;
    const metamask: MetaMaskProvider = {
      isMetaMask: true,
      request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") return [address];
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_switchEthereumChain") {
          if (switchCalls++ === 0) {
            throw { code: 4902, message: "Unknown chain" };
          }
          return null;
        }
        if (method === "wallet_getSnaps") {
          return { [snapId]: { id: snapId } };
        }
        if (method === "wallet_addEthereumChain") return null;
        throw new Error(`Unexpected wallet method: ${method}`);
      }),
    };

    await connectMetaMask(metamask, studionet);

    expect(metamask.request).toHaveBeenCalledWith({
      method: "wallet_addEthereumChain",
      params: [expect.objectContaining({
        chainId: "0xf22f",
        chainName: "Genlayer Studio Network",
      })],
    });
    expect(switchCalls).toBe(2);
  });

  it("does not switch when MetaMask is already on the configured network", async () => {
    const metamask = provider({
      eth_requestAccounts: [address],
      eth_chainId: "0xf22f",
      wallet_getSnaps: { [snapId]: { id: snapId } },
    });

    await connectMetaMask(metamask, studionet);

    expect(metamask.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "wallet_switchEthereumChain" }),
    );
  });

  it("requests the published GenLayer Snap when it is absent", async () => {
    const metamask = provider({
      eth_requestAccounts: [address],
      eth_chainId: "0xf22f",
      wallet_getSnaps: {},
      wallet_requestSnaps: { [snapId]: { id: snapId } },
    });

    await connectMetaMask(metamask, studionet);

    expect(metamask.request).toHaveBeenCalledWith({
      method: "wallet_requestSnaps",
      params: { [snapId]: {} },
    });
  });

  it("identifies the Snap stage when MetaMask does not support Snaps", async () => {
    const metamask: MetaMaskProvider = {
      isMetaMask: true,
      request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") return [address];
        if (method === "eth_chainId") return "0xf22f";
        if (method === "wallet_getSnaps") {
          throw { code: 4200, message: "Unsupported method" };
        }
        throw new Error(`Unexpected wallet method: ${method}`);
      }),
    };

    await expect(connectMetaMask(metamask, studionet)).rejects.toThrow(
      "GenLayer Snap setup failed: MetaMask does not support the required Snap method",
    );
  });

  it("rejects a malformed account before preparing the network", async () => {
    const metamask = provider({ eth_requestAccounts: ["not-an-address"] });

    await expect(connectMetaMask(metamask, studionet)).rejects.toThrow(
      "MetaMask did not return a valid account",
    );
    expect(metamask.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "eth_chainId" }),
    );
  });
});

describe("walletErrorMessage", () => {
  it.each([
    [{ code: 4001 }, "MetaMask request was rejected"],
    [{ code: -32002 }, "MetaMask already has a pending request"],
    [{ code: 4200 }, "MetaMask does not support the required Snap method"],
    [{ code: -32601 }, "MetaMask does not support the required Snap method"],
    [{ message: "Network is unavailable" }, "Network is unavailable"],
    [null, "MetaMask connection failed"],
  ])("maps provider failure %#", (error, expected) => {
    expect(walletErrorMessage(error)).toContain(expected);
  });
});
