import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createAccount, createClient } from "genlayer-js";
import { localnet } from "genlayer-js/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createReleaseProofApi, type ContractClientLike } from "./client";


const port = 4010;
const endpoint = `http://127.0.0.1:${port}/api`;
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const contractPath = resolve(repositoryRoot, "contracts/releaseproof.py");
let simulator: ChildProcess | undefined;

function pythonExecutable() {
  if (process.env.GENLAYER_PYTHON) return process.env.GENLAYER_PYTHON;
  const candidates = [
    resolve(repositoryRoot, ".venv/Scripts/python.exe"),
    resolve(repositoryRoot, ".venv/bin/python"),
  ];
  return candidates.find(existsSync) ?? "python";
}

async function rpc(method: string, params?: object) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const value = (await response.json()) as {
    result?: Record<string, unknown>;
    error?: { message?: string };
  };
  if (value.error) throw new Error(value.error.message ?? "GLSim RPC failed");
  return value.result ?? {};
}

async function waitForSimulator() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("GLSim did not start");
}

beforeAll(async () => {
  simulator = spawn(
    pythonExecutable(),
    [
      resolve(repositoryRoot, "tests/integration/glsim_entry.py"),
      "--port",
      String(port),
      "--validators",
      "3",
      "--max-rotations",
      "1",
      "--no-browser",
      "--seed",
      "releaseproof-integration",
    ],
    { cwd: repositoryRoot, stdio: "ignore", windowsHide: true },
  );
  await waitForSimulator();
});

afterAll(() => {
  simulator?.kill();
});

describe("frontend adapter to real ReleaseProof contract", () => {
  it("deploys, submits, resolves, and reads the immutable binding", async () => {
    const deployed = await rpc("sim_deploy", { code_path: contractPath, args: [] });
    const contractAddress = deployed.contract_address as `0x${string}`;
    const account = createAccount();
    const client = createClient({ chain: localnet, endpoint, account });
    const api = createReleaseProofApi(client as ContractClientLike, contractAddress);
    const input = {
      repository: "carbofozzz/questera",
      commitSha: "52d0e41bbc351bd69bf270bec0143eba40413dcc",
      artifactPath: "README.md",
      evidenceHash: "476efb7e033fab131ac56330423c2d457bfa0d3f8340624aa3f4114a888e197b",
    };

    const submittedHash = await api.submitCase(input);
    const submittedReceipt = (await api.waitForReceipt(submittedHash)) as {
      statusName?: string;
      txExecutionResultName?: string;
    };
    expect(submittedReceipt).toMatchObject({
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    });

    const binding = [
      "releaseproof-case-v1",
      "reproducibility-v1",
      input.repository,
      input.commitSha,
      input.artifactPath,
      input.evidenceHash,
    ].join("|");
    const caseId = await api.getCaseIdByBinding(binding);
    const submitted = await api.readCase(caseId);
    expect(submitted.state).toBe("SUBMITTED");
    expect(submitted.binding).toBe(binding);

    const resolvedHash = await api.resolveCase(caseId);
    const resolvedReceipt = (await api.waitForReceipt(resolvedHash)) as {
      statusName?: string;
      txExecutionResultName?: string;
    };
    expect(resolvedReceipt.statusName).toBe("FINALIZED");
    expect(resolvedReceipt.txExecutionResultName).toBe("FINISHED_WITH_RETURN");
    const resolved = await api.readCase(caseId);
    expect(["VERIFIED", "REJECTED", "UNRESOLVED"]).toContain(resolved.state);
    expect(resolved.binding).toBe(binding);
  });
});
