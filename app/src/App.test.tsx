import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { createWalletClient } from "./contract/client";


vi.mock("./contract/client", () => ({
  createReadClient: vi.fn(() => ({})),
  createReleaseProofApi: vi.fn(() => ({})),
  createWalletClient: vi.fn(),
}));
vi.mock("./contract/config", () => ({
  configuredContractAddress: vi.fn(() =>
    "0x10aE8E49717D9E90398F9E783bf6db7d25Be1A69"),
  configuredNetworkName: vi.fn(() => "studionet"),
}));

describe("wallet network connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.ethereum = {
      request: vi.fn().mockResolvedValue([
        "0x21b45103dd05c43969daF3CbB4277391777e2eC7",
      ]),
    };
  });

  it("connects the SDK to Studionet before exposing the wallet as ready", async () => {
    let finishNetworkConnection!: () => void;
    const networkConnection = new Promise<void>((resolve) => {
      finishNetworkConnection = resolve;
    });
    const connect = vi.fn(() => networkConnection);
    vi.mocked(createWalletClient).mockReturnValue({ connect } as never);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));

    await waitFor(() => expect(connect).toHaveBeenCalledWith("studionet"));
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeVisible();

    finishNetworkConnection();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "0x21b4…2eC7" })).toBeVisible();
    });
  });

  it("invalidates the connected wallet when its account changes", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    window.ethereum = {
      request: vi.fn().mockResolvedValue([
        "0x21b45103dd05c43969daF3CbB4277391777e2eC7",
      ]),
      on: vi.fn((event, listener) => listeners.set(event, listener)),
      removeListener: vi.fn(),
    };
    vi.mocked(createWalletClient).mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
    } as never);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: "0x21b4…2eC7" });

    listeners.get("accountsChanged")?.(["0x1111111111111111111111111111111111111111"]);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect wallet" })).toBeVisible();
      expect(screen.getByText(/wallet changed/i)).toBeVisible();
      expect(screen.getByRole("button", { name: "Submit evidence" })).toBeDisabled();
    });
  });
});
