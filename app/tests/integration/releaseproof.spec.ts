import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";


const appRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(appRoot, "..");
const rpcEndpoint = "http://127.0.0.1:4011/api";
const appUrl = "http://127.0.0.1:4173";
let simulator: ChildProcess;
let vite: ChildProcess;
let contractAddress = "";
const account = privateKeyToAccount(generatePrivateKey());

async function rpc(method: string, params?: unknown) {
  const response = await fetch(rpcEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const value = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (value.error) throw new Error(value.error.message ?? "GLSim RPC failed");
  return value.result;
}

async function waitForUrl(url: string, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Service is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Service did not start: ${url}`);
}

test.beforeAll(async () => {
  const python = process.env.GENLAYER_PYTHON
    ?? resolve(repositoryRoot, ".venv/Scripts/python.exe");
  simulator = spawn(
    python,
    [
      resolve(repositoryRoot, "tests/integration/glsim_entry.py"),
      "--port",
      "4011",
      "--validators",
      "3",
      "--max-rotations",
      "1",
      "--no-browser",
      "--seed",
      "releaseproof-browser",
    ],
    { cwd: repositoryRoot, stdio: "ignore", windowsHide: true },
  );
  await waitForUrl("http://127.0.0.1:4011/health");
  const deployment = (await rpc("sim_deploy", {
    code_path: resolve(repositoryRoot, "contracts/releaseproof.py"),
    args: [],
  })) as { contract_address: string };
  contractAddress = deployment.contract_address;

  vite = spawn(
    process.execPath,
    [resolve(appRoot, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4173"],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        VITE_GENLAYER_NETWORK: "localnet",
        VITE_GENLAYER_CONTRACT_ADDRESS: contractAddress,
        VITE_GENLAYER_RPC_URL: rpcEndpoint,
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await waitForUrl(appUrl);
});

test.afterAll(() => {
  vite?.kill();
  simulator?.kill();
});

test.beforeEach(async ({ page }) => {
  await page.exposeFunction("releaseProofWalletRequest", async (args: {
    method: string;
    params?: Array<Record<string, string>>;
  }) => {
    if (args.method === "eth_requestAccounts" || args.method === "eth_accounts") {
      return [account.address];
    }
    if (args.method === "eth_chainId") return "0xeec7";
    if (args.method === "wallet_getSnaps") {
      return {
        "npm:genlayer-wallet-plugin": {
          blocked: false,
          enabled: true,
          id: "npm:genlayer-wallet-plugin",
          version: "1.0.0",
        },
      };
    }
    if (args.method === "eth_sendTransaction") {
      const transaction = args.params?.[0];
      if (!transaction?.to || !transaction.data) throw new Error("Invalid wallet transaction");
      const nonceHex = (await rpc("eth_getTransactionCount", [account.address, "latest"])) as string;
      const signed = await account.signTransaction({
        chainId: 61127,
        data: transaction.data as `0x${string}`,
        gas: 30_000_000n,
        gasPrice: 0n,
        nonce: Number(BigInt(nonceHex)),
        to: transaction.to as `0x${string}`,
        type: "legacy",
        value: BigInt(transaction.value ?? "0x0"),
      });
      return rpc("eth_sendRawTransaction", [signed]);
    }
    throw new Error(`Unsupported test wallet method: ${args.method}`);
  });
  await page.addInitScript(({ address }) => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: (args: { method: string; params?: Array<Record<string, string>> }) =>
          (window as unknown as {
            releaseProofWalletRequest(value: typeof args): Promise<unknown>;
          }).releaseProofWalletRequest(args),
        selectedAddress: address,
      },
    });
  }, { address: account.address });
});

test("wallet submission reaches finalized contract readback and duplicate fails", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "transaction flow runs once");
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByText("Connect wallet to submit")).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: /0x.*…/ })).toBeVisible();

  await page.getByLabel("GitHub repository").fill("carbofozzz/questera");
  await page.getByLabel("Commit SHA").fill("52d0e41bbc351bd69bf270bec0143eba40413dcc");
  await page.getByLabel("Markdown path").fill("README.md");
  await page.getByLabel("Evidence SHA-256").fill("476efb7e033fab131ac56330423c2d457bfa0d3f8340624aa3f4114a888e197b");
  await page.getByRole("button", { name: "Submit evidence" }).click();

  await expect(page.getByText("Submitted for review")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Authoritative contract readback")).toBeVisible();
  await expect(page.getByText("#1")).toBeVisible();

  const firstHash = await page.locator(".timeline-hash").textContent();
  expect(firstHash).toMatch(/^0x[0-9a-f]+$/i);
  await page.evaluate(({ hash, binding }) => {
    sessionStorage.setItem("releaseproof:pendingTransaction", JSON.stringify({
      version: 1,
      kind: "submit",
      hash,
      binding,
    }));
  }, {
    hash: firstHash,
    binding: [
      "releaseproof-case-v1",
      "reproducibility-v1",
      "carbofozzz/questera",
      "52d0e41bbc351bd69bf270bec0143eba40413dcc",
      "README.md",
      "476efb7e033fab131ac56330423c2d457bfa0d3f8340624aa3f4114a888e197b",
    ].join("|"),
  });
  await page.reload();
  await expect(page.getByText("Authoritative contract readback")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("#1")).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).click();

  await page.getByLabel("GitHub repository").fill("carbofozzz/questera");
  await page.getByLabel("Commit SHA").fill("52d0e41bbc351bd69bf270bec0143eba40413dcc");
  await page.getByLabel("Markdown path").fill("README.md");
  await page.getByLabel("Evidence SHA-256").fill("476efb7e033fab131ac56330423c2d457bfa0d3f8340624aa3f4114a888e197b");
  await page.getByRole("button", { name: "Submit evidence" }).click();
  await expect(page.getByText("Execution failed")).toBeVisible({ timeout: 45_000 });
  expect(consoleErrors).toEqual([]);
});

test("mobile layout has no horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only assertion");
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
});
