import { useEffect, useRef, useState, type FormEvent } from "react";

import type { ReleaseProofApi } from "../../contract/client";
import type { CaseRecord, SubmissionInput, TransactionHash } from "../../contract/types";
import { configuredNetworkName } from "../../contract/config";
import { CaseForm } from "./CaseForm";
import { CaseReadback } from "./CaseReadback";
import { TransactionTimeline } from "./TransactionTimeline";


export type WorkspacePhase =
  | "disconnected"
  | "idle"
  | "signing"
  | "pending"
  | "finalized"
  | "success"
  | "readback"
  | "execution_error"
  | "error";

const PENDING_KEY = "releaseproof:pendingTransaction";

type PendingTransaction = {
  version: 1;
  kind: "submit" | "resolve";
  hash: TransactionHash;
  binding?: string;
  caseId?: number;
};

function loadPending(): PendingTransaction | undefined {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<PendingTransaction>;
    if (
      value.version !== 1
      || (value.kind !== "submit" && value.kind !== "resolve")
      || typeof value.hash !== "string"
      || !/^0x[0-9a-fA-F]+$/.test(value.hash)
    ) return undefined;
    if (value.kind === "submit" && typeof value.binding !== "string") return undefined;
    if (value.kind === "resolve" && (!Number.isSafeInteger(value.caseId) || Number(value.caseId) < 1)) return undefined;
    return value as PendingTransaction;
  } catch {
    return undefined;
  }
}

function savePending(value: PendingTransaction) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
}

function bindingFor(input: SubmissionInput) {
  return [
    "releaseproof-case-v2",
    "reproducibility-v1",
    "submit_case",
    input.repository.trim().toLowerCase(),
    input.commitSha.trim().toLowerCase(),
    input.artifactPath.trim(),
    input.evidenceHash.trim().toLowerCase(),
  ].join("|");
}

export function CaseWorkspace({
  initialPhase = "disconnected",
  contractApi,
  readApi,
  walletConnected,
  writeApi,
}: {
  initialPhase?: WorkspacePhase;
  contractApi?: ReleaseProofApi;
  readApi?: ReleaseProofApi;
  walletConnected?: boolean;
  writeApi?: ReleaseProofApi;
}) {
  const [phase, setPhase] = useState<WorkspacePhase>(initialPhase);
  const [hash, setHash] = useState<TransactionHash>();
  const [readback, setReadback] = useState<CaseRecord>();
  const [lookupId, setLookupId] = useState("");
  const [error, setError] = useState("");
  const [pendingTransaction, setPendingTransaction] = useState<PendingTransaction>();
  const [milestones, setMilestones] = useState<WorkspacePhase[]>([]);
  const restoredHash = useRef("");
  const connected = walletConnected ?? initialPhase !== "disconnected";
  const activeReadApi = readApi ?? contractApi ?? writeApi;
  const activeWriteApi = writeApi ?? (connected ? contractApi : undefined);
  const busy = ["signing", "pending", "finalized", "success"].includes(phase);
  const network = configuredNetworkName();

  useEffect(() => {
    if (initialPhase === "idle") {
      setPhase((current) => current === "disconnected" ? "idle" : current);
    } else {
      setPhase((current) => current === "idle" ? "disconnected" : current);
    }
  }, [initialPhase]);

  async function reconcilePending(pending: PendingTransaction) {
    if (!activeReadApi) throw new Error("Contract read client is not available");
    setError("");
    setPendingTransaction(pending);
    setHash(pending.hash);
    setMilestones(["pending"]);
    setPhase("pending");
    const receipt = (await activeReadApi.waitForReceipt(pending.hash)) as {
      statusName?: string;
      txExecutionResultName?: string;
    };
    if (receipt.statusName !== "FINALIZED") {
      setError("Transaction is not finalized yet. Resume reconciliation to check again.");
      return;
    }
    setPhase("finalized");
    setMilestones((current) => [...current, "finalized"]);
    if (receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
      setPhase("execution_error");
      setMilestones((current) => [...current, "execution_error"]);
      return;
    }
    setPhase("success");
    setMilestones((current) => [...current, "success"]);
    const caseId = pending.kind === "submit"
      ? await activeReadApi.getCaseIdByBinding(pending.binding ?? "")
      : pending.caseId ?? 0;
    if (caseId < 1) throw new Error("Finalized transaction has no contract case ID");
    const value = await activeReadApi.readCase(caseId);
    setReadback(value);
    setPhase("readback");
    setMilestones((current) => [...current, "readback"]);
    sessionStorage.removeItem(PENDING_KEY);
    setPendingTransaction(undefined);
  }

  useEffect(() => {
    if (!activeReadApi) return;
    const pending = loadPending();
    if (!pending || restoredHash.current === pending.hash) return;
    restoredHash.current = pending.hash;
    void reconcilePending(pending).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Transaction reconciliation failed");
      setPhase("error");
    });
  }, [activeReadApi]);

  async function submit(input: SubmissionInput) {
    if (!activeWriteApi) {
      setError("Contract address or wallet client is not configured.");
      setPhase("error");
      return;
    }
    try {
      setError("");
      setPhase("signing");
      const transactionHash = await activeWriteApi.submitCase(input);
      const pending: PendingTransaction = {
        version: 1,
        kind: "submit",
        hash: transactionHash,
        binding: bindingFor(input),
      };
      savePending(pending);
      await reconcilePending(pending);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request failed");
      setPhase("error");
    }
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    const caseId = Number(lookupId);
    if (!activeReadApi || !Number.isSafeInteger(caseId) || caseId < 1) {
      setError("Enter a valid case ID and configure the contract.");
      setPhase("error");
      return;
    }
    try {
      setError("");
      const value = await activeReadApi.readCase(caseId);
      setReadback(value);
      setPhase("readback");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Case readback failed");
      setPhase("error");
    }
  }

  async function resolve() {
    if (!activeWriteApi || !readback) return;
    try {
      setError("");
      setPhase("signing");
      const transactionHash = await activeWriteApi.resolveCase(readback.case_id);
      const pending: PendingTransaction = {
        version: 1,
        kind: "resolve",
        hash: transactionHash,
        caseId: readback.case_id,
      };
      savePending(pending);
      await reconcilePending(pending);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Resolution failed");
      setPhase("error");
    }
  }

  return (
    <div className="workspace">
      <section className="intro-panel">
        <div>
          <p className="eyebrow">Reproducibility registry</p>
          <h1>Turn pinned research evidence into an on-chain decision.</h1>
          <p className="intro-copy">
            GenLayer validators inspect one immutable GitHub artifact against Reproducibility Policy v1.
            The contract—not this interface—records the outcome.
          </p>
        </div>
        <div className="policy-chip">
          <span className="policy-orbit" aria-hidden="true" />
          <div><strong>4 criteria</strong><span>One frozen policy</span></div>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="panel submission-panel" aria-labelledby="submit-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">New case</p>
              <h2 id="submit-title">Bind research evidence</h2>
            </div>
            <span className="step-label">01 / Submit</span>
          </div>
          <CaseForm walletConnected={connected} busy={busy} onSubmit={submit} />
        </section>

        <aside className="activity-column" aria-label="Transaction status and lookup">
          <TransactionTimeline phase={phase} hash={hash} network={network} milestones={milestones} />
          {error && <div className="error-banner" role="alert">{error}</div>}
          {pendingTransaction && ["pending", "execution_error", "error"].includes(phase) && (
            <div className="transaction-actions">
              <button onClick={() => {
                void reconcilePending(pendingTransaction).catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : "Transaction reconciliation failed");
                  setPhase("error");
                });
              }} type="button">Resume transaction</button>
              <button onClick={() => {
                sessionStorage.removeItem(PENDING_KEY);
                setPendingTransaction(undefined);
                setHash(undefined);
                setMilestones([]);
                setError("");
                setPhase(connected ? "idle" : "disconnected");
              }} type="button">Dismiss transaction</button>
            </div>
          )}
          <form className="lookup-panel" onSubmit={lookup}>
            <div><p className="eyebrow">Read registry</p><h2>Look up a case</h2></div>
            <label className="lookup-field">
              <span className="sr-only">Case ID</span>
              <input
                inputMode="numeric"
                min="1"
                onChange={(event) => setLookupId(event.target.value)}
                placeholder="Case ID"
                type="number"
                value={lookupId}
              />
              <button type="submit">Read</button>
            </label>
          </form>
        </aside>
      </div>

      {readback && (
        <div className="readback-wrap">
          <CaseReadback value={readback} />
          {readback.state === "SUBMITTED" && connected && (
            <button className="resolve-button" disabled={busy} onClick={resolve} type="button">
              Ask validators to resolve
            </button>
          )}
        </div>
      )}
    </div>
  );
}
