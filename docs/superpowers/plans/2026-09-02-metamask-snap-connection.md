# MetaMask and GenLayer Snap Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ReleaseProof connect deterministically to desktop MetaMask and the published GenLayer Snap while showing actionable wallet errors instead of `Wallet connection failed`.

**Architecture:** Add one wallet boundary that selects MetaMask, prepares the configured GenLayer network, ensures the Snap, and normalizes EIP-1193 failures. `App.tsx` will use the returned provider and account consistently and will create the GenLayer write client only after preparation succeeds; contract code and authoritative readback remain unchanged.

**Tech Stack:** React 19.2.8, TypeScript 6.0.2, Vite 8.2.2, Vitest 4.1.11, Testing Library 16.3.2, Playwright 1.62.1, `genlayer-js` 1.1.8.

## Global Constraints

- Support desktop MetaMask plus Snap ID `npm:genlayer-wallet-plugin`; do not add generic wallet support or a wallet framework.
- Keep `VITE_GENLAYER_NETWORK`, `configuredChain()`, and the deployed contract address as the only network and contract configuration sources.
- Do not call `genlayer-js` `client.connect()` from the app because version 1.1.8 reads the global provider again.
- Never store a wallet address or write API until account, network, and Snap preparation all succeed.
- Preserve read-only contract access while disconnected.
- Do not modify the Intelligent Contract, deployment manifests, evidence binding, state machine, or `INTENTIONALLY_FROZEN` classification.
- Do not push GitHub or deploy Vercel without action-time confirmation of the active accounts.

---

### Task 1: Deterministic MetaMask connector

**Files:**
- Create: `app/src/wallet/metamask.ts`
- Create: `app/src/wallet/metamask.test.ts`
- Modify: `app/src/contract/client.ts:10-15`

**Interfaces:**
- Consumes: `WalletProvider` from `app/src/contract/client.ts` and a viem-compatible chain returned by `configuredChain()`.
- Produces: `MetaMaskProvider`, `ConnectedMetaMask`, `selectMetaMaskProvider(injected)`, `connectMetaMask(injected, chain)`, and `walletErrorMessage(error)`.

- [ ] **Step 1: Widen the provider request type in the test expectation, then write connector selection tests**

Create `app/src/wallet/metamask.test.ts` with real provider objects whose request logs are asserted:

```ts
import { describe, expect, it, vi } from "vitest";
import { studionet } from "genlayer-js/chains";

import {
  connectMetaMask,
  selectMetaMaskProvider,
  walletErrorMessage,
  type MetaMaskProvider,
} from "./metamask";

function provider(
  responses: Record<string, unknown>,
  isMetaMask = true,
): MetaMaskProvider {
  return {
    isMetaMask,
    request: vi.fn(async ({ method }) => {
      const value = responses[method];
      if (value instanceof Error || (value && typeof value === "object" && "code" in value)) {
        throw value;
      }
      return value;
    }),
  };
}

describe("selectMetaMaskProvider", () => {
  it("selects MetaMask from a multi-provider injection", () => {
    const other = provider({}, false);
    const metamask = provider({});
    expect(selectMetaMaskProvider({ ...other, providers: [other, metamask] })).toBe(metamask);
  });

  it("rejects an injection that does not contain MetaMask", () => {
    expect(() => selectMetaMaskProvider(provider({}, false))).toThrow(
      "MetaMask was not found",
    );
  });
});
```

- [ ] **Step 2: Run the selection tests and verify RED**

Run: `npm --prefix app test -- --run src/wallet/metamask.test.ts`

Expected: FAIL because `./metamask` does not exist. This is the intended failure proving the new connector boundary is absent.

- [ ] **Step 3: Add network, Snap, and error regression tests**

Append tests that exercise the observable RPC sequence:

```ts
const address = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";
const snapId = "npm:genlayer-wallet-plugin";

it("switches an existing network without adding it", async () => {
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
      if (method === "wallet_switchEthereumChain" && switchCalls++ === 0) {
        throw { code: 4902, message: "Unknown chain" };
      }
      if (method === "wallet_getSnaps") return { [snapId]: { id: snapId } };
      return null;
    }),
  };

  await connectMetaMask(metamask, studionet);
  expect(metamask.request).toHaveBeenCalledWith({
    method: "wallet_addEthereumChain",
    params: [expect.objectContaining({ chainId: "0xf22f" })],
  });
  expect(switchCalls).toBe(2);
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
  const metamask = provider({
    eth_requestAccounts: [address],
    eth_chainId: "0xf22f",
    wallet_getSnaps: { code: 4200, message: "Unsupported method" },
  });
  await expect(connectMetaMask(metamask, studionet)).rejects.toThrow(
    "GenLayer Snap setup failed: MetaMask does not support the required Snap method",
  );
});

it.each([
  [{ code: 4001 }, "MetaMask request was rejected"],
  [{ code: -32002 }, "MetaMask already has a pending request"],
  [{ code: 4200 }, "MetaMask does not support the required Snap method"],
  [{ code: -32601 }, "MetaMask does not support the required Snap method"],
  [{ message: "Network is unavailable" }, "Network is unavailable"],
  [null, "MetaMask connection failed"],
])("maps provider error %#", (error, expected) => {
  expect(walletErrorMessage(error)).toContain(expected);
});
```

- [ ] **Step 4: Implement the minimal connector**

In `app/src/contract/client.ts`, change the request signature to accept both array and Snap object parameters:

```ts
export interface WalletProvider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}
```

Create `app/src/wallet/metamask.ts` with these exact public types and flow:

```ts
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
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === "number" ? value : Number(value);
}

export function walletErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 4001) return "MetaMask request was rejected. Approve the request and try again.";
  if (code === -32002) return "MetaMask already has a pending request. Open MetaMask and complete it.";
  if (code === 4200 || code === -32601) {
    return "MetaMask does not support the required Snap method. Update desktop MetaMask and try again.";
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
  const candidates = injected?.providers?.length ? injected.providers : injected ? [injected] : [];
  const selected = candidates.find((candidate) => candidate.isMetaMask === true);
  if (!selected) {
    throw new Error("MetaMask was not found. Install and unlock desktop MetaMask, then reload this page.");
  }
  return selected;
}

async function ensureNetwork(provider: MetaMaskProvider, chain: MetaMaskChain) {
  const chainId = `0x${chain.id.toString(16)}`;
  if (await provider.request({ method: "eth_chainId" }) === chainId) return;
  const switchRequest = () => provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId }],
  });
  try {
    await switchRequest();
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
    await switchRequest();
  }
}

async function ensureSnap(provider: MetaMaskProvider) {
  const installed = await provider.request({ method: "wallet_getSnaps" });
  const snaps = installed && typeof installed === "object" ? Object.values(installed) : [];
  if (snaps.some((snap) => snap && typeof snap === "object" &&
    (snap as { id?: unknown }).id === GENLAYER_SNAP_ID)) return;
  await provider.request({
    method: "wallet_requestSnaps",
    params: { [GENLAYER_SNAP_ID]: {} },
  });
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
    throw new Error(`MetaMask account access failed: ${walletErrorMessage(error)}`);
  }
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])) {
    throw new Error("MetaMask did not return a valid account.");
  }
  try {
    await ensureNetwork(provider, chain);
  } catch (error) {
    throw new Error(`MetaMask network setup failed: ${walletErrorMessage(error)}`);
  }
  try {
    await ensureSnap(provider);
  } catch (error) {
    throw new Error(`GenLayer Snap setup failed: ${walletErrorMessage(error)}`);
  }
  return { address: accounts[0], provider };
}
```

The connector uses its own exported structural `MetaMaskChain` type; do not add
`viem` as a direct application dependency solely for a type import.

- [ ] **Step 5: Run connector tests and verify GREEN**

Run: `npm --prefix app test -- --run src/wallet/metamask.test.ts`

Expected: the connector test file passes with zero failures.

- [ ] **Step 6: Commit the connector boundary**

```powershell
git add -- app/src/contract/client.ts app/src/wallet/metamask.ts app/src/wallet/metamask.test.ts
git commit -m "fix: prepare MetaMask and GenLayer Snap explicitly"
```

---

### Task 2: Connect the React UI to the selected MetaMask provider

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/App.test.tsx`

**Interfaces:**
- Consumes: `connectMetaMask(window.ethereum, configuredChain())`, `walletErrorMessage(error)`, `ConnectedMetaMask.provider`, and the existing `createWalletClient(address, provider)`.
- Produces: a connected UI only after successful MetaMask preparation, event invalidation bound to the selected provider, and button copy `Connect MetaMask`.

- [ ] **Step 1: Replace the old App tests with failing behavior tests**

Mock the new wallet boundary and configured chain in `app/src/App.test.tsx`:

```ts
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { createWalletClient } from "./contract/client";
import { connectMetaMask, walletErrorMessage } from "./wallet/metamask";

vi.mock("./contract/client", () => ({
  createReadClient: vi.fn(() => ({})),
  createReleaseProofApi: vi.fn(() => ({})),
  createWalletClient: vi.fn(() => ({})),
}));
vi.mock("./contract/config", () => ({
  configuredChain: vi.fn(() => ({ id: 61999 })),
  configuredContractAddress: vi.fn(() => "0x10aE8E49717D9E90398F9E783bf6db7d25Be1A69"),
  configuredNetworkName: vi.fn(() => "studionet"),
}));
vi.mock("./wallet/metamask", () => ({
  connectMetaMask: vi.fn(),
  walletErrorMessage: vi.fn((error: unknown) =>
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "MetaMask connection failed",
  ),
}));

const address = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";

describe("MetaMask connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.ethereum = { isMetaMask: true, request: vi.fn() };
  });

  it("exposes the wallet only after MetaMask preparation finishes", async () => {
    let finish!: (value: { address: string; provider: typeof window.ethereum }) => void;
    vi.mocked(connectMetaMask).mockReturnValue(new Promise((resolve) => { finish = resolve; }) as never);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Connect MetaMask" }));
    expect(screen.getByRole("button", { name: "Connect MetaMask" })).toBeVisible();
    await act(async () => finish({ address, provider: window.ethereum! }));
    await screen.findByRole("button", { name: "0x21b4…2eC7" });
    expect(createWalletClient).toHaveBeenCalledWith(address, window.ethereum);
  });

  it("keeps writes disconnected and shows the normalized provider error", async () => {
    const failure = { code: 4001 };
    vi.mocked(connectMetaMask).mockRejectedValue(failure);
    vi.mocked(walletErrorMessage).mockReturnValue("MetaMask request was rejected.");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Connect MetaMask" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("MetaMask request was rejected.");
    expect(screen.getByRole("button", { name: "Submit evidence" })).toBeDisabled();
  });
});
```

Retain and update the existing account-change test so its event map belongs to the provider returned by `connectMetaMask`, and wrap the event call in `act`:

```ts
it("invalidates the wallet when the selected MetaMask provider changes", async () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const selected = {
    isMetaMask: true,
    request: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener)),
    removeListener: vi.fn(),
  };
  vi.mocked(connectMetaMask).mockResolvedValue({ address, provider: selected });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Connect MetaMask" }));
  await screen.findByRole("button", { name: "0x21b4…2eC7" });
  act(() => listeners.get("accountsChanged")?.(["0x1111111111111111111111111111111111111111"]));
  await waitFor(() => expect(screen.getByRole("button", { name: "Connect MetaMask" })).toBeVisible());
  expect(screen.getByText(/wallet changed/i)).toBeVisible();
});
```

- [ ] **Step 2: Run App tests and verify RED**

Run: `npm --prefix app test -- --run src/App.test.tsx`

Expected: FAIL because `App.tsx` still exposes `Connect wallet`, calls `client.connect`, and does not use the selected provider returned by `connectMetaMask`.

- [ ] **Step 3: Implement the minimal App integration**

Update `app/src/App.tsx` as follows:

```ts
import { configuredChain, configuredContractAddress, configuredNetworkName } from "./contract/config";
import {
  connectMetaMask,
  walletErrorMessage,
  type MetaMaskProvider,
} from "./wallet/metamask";
```

Remove the local `Window` declaration. Add selected-provider state next to the existing wallet state:

```ts
const [walletProvider, setWalletProvider] = useState<MetaMaskProvider>();
```

Bind listeners to `walletProvider`, clear all write-side state on invalidation, and include the provider in the effect dependency:

```ts
useEffect(() => {
  if (!walletProvider?.on) return;
  const invalidateWallet = () => {
    setWalletAddress("");
    setWalletApi(undefined);
    setWalletProvider(undefined);
    setWalletError("Wallet changed. Reconnect to continue safely.");
  };
  walletProvider.on("accountsChanged", invalidateWallet);
  walletProvider.on("chainChanged", invalidateWallet);
  walletProvider.on("disconnect", invalidateWallet);
  return () => {
    walletProvider.removeListener?.("accountsChanged", invalidateWallet);
    walletProvider.removeListener?.("chainChanged", invalidateWallet);
    walletProvider.removeListener?.("disconnect", invalidateWallet);
  };
}, [walletProvider]);
```

Replace `connectWallet` with:

```ts
async function connectWallet() {
  try {
    setWalletError("");
    setWalletAddress("");
    setWalletApi(undefined);
    setWalletProvider(undefined);
    const connected = await connectMetaMask(window.ethereum, configuredChain());
    const client = createWalletClient(connected.address, connected.provider);
    const api = createReleaseProofApi(client, configuredContractAddress());
    setWalletProvider(connected.provider);
    setWalletAddress(connected.address);
    setWalletApi(api);
  } catch (error) {
    setWalletError(walletErrorMessage(error));
  }
}
```

Change disconnected button copy from `Connect wallet` to `Connect MetaMask`.

- [ ] **Step 4: Run App and connector tests and verify GREEN**

Run: `npm --prefix app test -- --run src/App.test.tsx src/wallet/metamask.test.ts`

Expected: both test files pass with zero React `act(...)` warnings.

- [ ] **Step 5: Commit the React integration**

```powershell
git add -- app/src/App.tsx app/src/App.test.tsx
git commit -m "fix: connect UI through selected MetaMask provider"
```

---

### Task 3: Browser fixture, user guidance, and full verification

**Files:**
- Modify: `app/tests/integration/releaseproof.spec.ts:90-215`
- Modify: `README.md:68-80`

**Interfaces:**
- Consumes: UI accessible name `Connect MetaMask` and injected provider flag `isMetaMask: true`.
- Produces: a real GLSim browser regression path using the same MetaMask-only connector contract and documented reviewer instructions.

- [ ] **Step 1: Update the browser fixture and expectations**

In the injected provider created by `page.addInitScript`, add the MetaMask identity flag:

```ts
value: {
  isMetaMask: true,
  request: (args: { method: string; params?: unknown }) =>
    (window as unknown as {
      releaseProofWalletRequest(value: typeof args): Promise<unknown>;
    }).releaseProofWalletRequest(args),
  selectedAddress: address,
},
```

Replace all three accessible-name expectations/clicks from `Connect wallet` to `Connect MetaMask`. Keep the existing `wallet_getSnaps` response so the test proves the installed-Snap path and does not open any installation UI.

- [ ] **Step 2: Update reviewer-facing wallet requirements**

Replace the README deployment-use sentence with:

```md
In the app, use unlocked desktop MetaMask with Snaps enabled. Click
`Connect MetaMask`; ReleaseProof selects MetaMask even when another injected
wallet is installed, switches to the configured GenLayer network, and requests
the published `npm:genlayer-wallet-plugin` Snap when absent. Approve the account,
network, and Snap prompts before submitting `owner/repository`, a 40-character
commit, a Markdown path, and the raw file SHA-256.
```

- [ ] **Step 3: Run the complete frontend verification suite**

Run each command independently and require exit code `0`:

```powershell
npm --prefix app test -- --run
npm --prefix app run lint
npm --prefix app run build
npm --prefix app run test:e2e
```

Expected: all unit tests, lint, production build, desktop transaction flow, and mobile overflow test pass. If the local GLSim prerequisite prevents E2E startup, record the exact failure and do not claim E2E success.

- [ ] **Step 4: Inspect repository hygiene**

Run:

```powershell
git status --short
git diff --check
git diff --stat a20dda24e254ccecfc9782f589d307c8e497c6e3..HEAD
git ls-files | rg "(^|/)(node_modules|dist|coverage|\.env)(/|$)"
```

Expected: only source, tests, README, spec, and plan are changed; no dependency directory, build output, cache, credential, `.env`, or local instruction file is tracked.

- [ ] **Step 5: Commit browser coverage and guidance**

```powershell
git add -- app/tests/integration/releaseproof.spec.ts README.md
git commit -m "test: cover MetaMask Snap connection path"
```

- [ ] **Step 6: Stop before external actions**

Report the branch name, commit list, test/build/lint/E2E evidence, and remaining limitation that a real MetaMask popup cannot be automated without the user's active wallet session. Then inspect Git author, GitHub CLI account, repository remote/owner, and Vercel project/team. State the exact proposed push and production deployment, and wait for explicit user confirmation before either action.
