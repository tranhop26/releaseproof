import type { CaseRecord } from "../contract/types";


const labels: Record<CaseRecord["state"], string> = {
  SUBMITTED: "Submitted",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  UNRESOLVED: "Unresolved",
};

export function StatusBadge({ state }: { state: CaseRecord["state"] }) {
  return <span className={`status-badge status-${state.toLowerCase()}`}>{labels[state]}</span>;
}
