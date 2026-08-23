import type { WorkspacePhase } from "./CaseWorkspace";


const phaseCopy: Record<WorkspacePhase, { title: string; detail: string }> = {
  disconnected: {
    title: "Connect wallet to submit",
    detail: "Readback remains available without a wallet.",
  },
  idle: {
    title: "Ready for evidence",
    detail: "Provide one immutable GitHub evidence binding.",
  },
  signing: {
    title: "Confirm in wallet",
    detail: "Review the contract call before signing.",
  },
  pending: {
    title: "Consensus in progress",
    detail: "Waiting for the GenLayer transaction to finalize.",
  },
  finalized: {
    title: "Transaction finalized",
    detail: "Consensus is final. Checking the contract execution result.",
  },
  success: {
    title: "Execution succeeded",
    detail: "The contract call returned successfully. Reading authoritative state.",
  },
  readback: {
    title: "Contract state synchronized",
    detail: "The interface now reflects on-chain readback.",
  },
  execution_error: {
    title: "Execution failed",
    detail: "The transaction finalized without a successful contract return.",
  },
  error: {
    title: "Request failed",
    detail: "No success state was inferred. Review the error and try a new action.",
  },
};

const milestoneCopy: Partial<Record<WorkspacePhase, string>> = {
  pending: "Pending",
  finalized: "Finalized",
  success: "Execution success",
  readback: "Readback",
  execution_error: "Execution error",
};

export function TransactionTimeline({
  phase,
  hash,
  milestones = [],
}: {
  phase: WorkspacePhase;
  hash?: string;
  milestones?: WorkspacePhase[];
}) {
  const active = phaseCopy[phase];
  return (
    <section className={`timeline phase-${phase}`} aria-live="polite">
      <div className="timeline-pulse" aria-hidden="true" />
      <div>
        <p className="timeline-title">{active.title}</p>
        <p className="timeline-detail">{active.detail}</p>
        {hash && <p className="mono timeline-hash">{hash}</p>}
        {milestones.length > 0 && (
          <ol aria-label="Transaction milestones" className="transaction-milestones">
            {milestones.map((milestone, index) => (
              <li key={`${milestone}-${index}`}>{milestoneCopy[milestone] ?? milestone}</li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
