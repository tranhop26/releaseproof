import { useState, type FormEvent } from "react";

import type { ReleaseProofApi } from "../../contract/client";
import type { CaseRecord, SubmissionInput, TransactionHash } from "../../contract/types";
import { CaseForm } from "./CaseForm";
import { CaseReadback } from "./CaseReadback";
import { TransactionTimeline } from "./TransactionTimeline";


export type WorkspacePhase =
  | "disconnected"
  | "idle"
  | "signing"
  | "pending"
  | "finalized"
  | "readback"
  | "execution_error"
  | "error";

function bindingFor(input: SubmissionInput) {
  return [
    "releaseproof-case-v1",
    "reproducibility-v1",
    input.repository.trim().toLowerCase(),
    input.commitSha.trim().toLowerCase(),
    input.artifactPath.trim(),
    input.evidenceHash.trim().toLowerCase(),
  ].join("|");
}

export function CaseWorkspace({
  initialPhase = "disconnected",
  contractApi,
}: {
  initialPhase?: WorkspacePhase;
  contractApi?: ReleaseProofApi;
}) {
  const [phase, setPhase] = useState<WorkspacePhase>(initialPhase);
  const [hash, setHash] = useState<TransactionHash>();
  const [readback, setReadback] = useState<CaseRecord>();
  const [lookupId, setLookupId] = useState("");
  const [error, setError] = useState("");
  const connected = phase !== "disconnected";
  const busy = ["signing", "pending", "finalized"].includes(phase);

  async function finalizeAndRead(transactionHash: TransactionHash, caseId: number) {
    if (!contractApi) throw new Error("Contract client is not available");
    setPhase("pending");
    const receipt = (await contractApi.waitForReceipt(transactionHash)) as {
      statusName?: string;
      txExecutionResultName?: string;
    };
    if (receipt.statusName !== "FINALIZED") return;
    if (receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
      setPhase("execution_error");
      return;
    }
    setPhase("finalized");
    const value = await contractApi.readCase(caseId);
    setReadback(value);
    setPhase("readback");
  }

  async function submit(input: SubmissionInput) {
    if (!contractApi) {
      setError("Contract address or wallet client is not configured.");
      setPhase("error");
      return;
    }
    try {
      setError("");
      setPhase("signing");
      const transactionHash = await contractApi.submitCase(input);
      setHash(transactionHash);
      sessionStorage.setItem("releaseproof:lastTransaction", transactionHash);
      setPhase("pending");
      const receipt = (await contractApi.waitForReceipt(transactionHash)) as {
        statusName?: string;
        txExecutionResultName?: string;
      };
      if (receipt.statusName !== "FINALIZED") return;
      if (receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
        setPhase("execution_error");
        return;
      }
      setPhase("finalized");
      const caseId = await contractApi.getCaseIdByBinding(bindingFor(input));
      if (caseId < 1) throw new Error("Finalized submission has no contract case ID");
      const value = await contractApi.readCase(caseId);
      setReadback(value);
      setPhase("readback");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request failed");
      setPhase("error");
    }
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    const caseId = Number(lookupId);
    if (!contractApi || !Number.isSafeInteger(caseId) || caseId < 1) {
      setError("Enter a valid case ID and configure the contract.");
      setPhase("error");
      return;
    }
    try {
      setError("");
      const value = await contractApi.readCase(caseId);
      setReadback(value);
      setPhase("readback");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Case readback failed");
      setPhase("error");
    }
  }

  async function resolve() {
    if (!contractApi || !readback) return;
    try {
      setError("");
      setPhase("signing");
      const transactionHash = await contractApi.resolveCase(readback.case_id);
      setHash(transactionHash);
      sessionStorage.setItem("releaseproof:lastTransaction", transactionHash);
      await finalizeAndRead(transactionHash, readback.case_id);
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
          <TransactionTimeline phase={phase} hash={hash} />
          {error && <div className="error-banner" role="alert">{error}</div>}
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
