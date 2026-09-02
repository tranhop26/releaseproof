import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { createWalletClient } from "./contract/client";
import {
  connectMetaMask,
  walletErrorMessage,
  type ConnectedMetaMask,
  type MetaMaskProvider,
} from "./wallet/metamask";


vi.mock("./contract/client", () => ({
  createReadClient: vi.fn(() => ({})),
  createReleaseProofApi: vi.fn(() => ({})),
  createWalletClient: vi.fn(() => ({})),
}));
vi.mock("./contract/config", () => ({
  configuredChain: vi.fn(() => ({ id: 61999 })),
  configuredContractAddress: vi.fn(() =>
    "0x10aE8E49717D9E90398F9E783bf6db7d25Be1A69"),
  configuredNetworkName: vi.fn(() => "studionet"),
}));
vi.mock("./wallet/metamask", () => ({
  connectMetaMask: vi.fn(),
  walletErrorMessage: vi.fn((error: unknown) => (
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "MetaMask connection failed"
  )),
}));

const address = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";

function injectedProvider(): MetaMaskProvider {
  return { isMetaMask: true, request: vi.fn() };
}

describe("MetaMask connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.ethereum = injectedProvider();
  });

  it("exposes the wallet only after MetaMask preparation finishes", async () => {
    let finish!: (value: ConnectedMetaMask) => void;
    const preparation = new Promise<ConnectedMetaMask>((resolve) => {
      finish = resolve;
    });
    vi.mocked(connectMetaMask).mockReturnValue(preparation);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Connect MetaMask" }));

    expect(screen.getByRole("button", { name: "Connect MetaMask" })).toBeVisible();
    await act(async () => {
      finish({ address, provider: window.ethereum! });
      await preparation;
    });

    await screen.findByRole("button", { name: "0x21b4…2eC7" });
    expect(createWalletClient).toHaveBeenCalledWith(address, window.ethereum);
  });

  it("keeps writes disconnected and shows the normalized provider error", async () => {
    const failure = { code: 4001 };
    vi.mocked(connectMetaMask).mockRejectedValue(failure);
    vi.mocked(walletErrorMessage).mockReturnValue("MetaMask request was rejected.");

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Connect MetaMask" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "MetaMask request was rejected.",
    );
    expect(screen.getByRole("button", { name: "Submit evidence" })).toBeDisabled();
    expect(createWalletClient).not.toHaveBeenCalled();
  });

  it("invalidates the wallet when the selected MetaMask provider changes", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const selected: MetaMaskProvider = {
      isMetaMask: true,
      request: vi.fn(),
      on: vi.fn((event, listener) => listeners.set(event, listener)),
      removeListener: vi.fn(),
    };
    vi.mocked(connectMetaMask).mockResolvedValue({ address, provider: selected });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Connect MetaMask" }));
    await screen.findByRole("button", { name: "0x21b4…2eC7" });

    act(() => {
      listeners.get("accountsChanged")?.([
        "0x1111111111111111111111111111111111111111",
      ]);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect MetaMask" })).toBeVisible();
    });
    expect(screen.getByText(/wallet changed/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit evidence" })).toBeDisabled();
  });
});
