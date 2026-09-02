import type { CaseRecord } from "../../contract/types";
import { StatusBadge } from "../../ui/StatusBadge";


const stateTitles: Record<CaseRecord["state"], string> = {
  SUBMITTED: "Submitted for review",
  VERIFIED: "Reproducibility verified",
  REJECTED: "Requirements not met",
  UNRESOLVED: "Unresolved evidence",
};

const criteriaLabels: Record<keyof CaseRecord["criteria"], string> = {
  question: "Question or hypothesis",
  procedure: "Procedure and dependencies",
  results: "Results linked to procedure",
  limitations: "Limitations disclosed",
};

function short(value: string) {
  return value.length > 24 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

export function CaseReadback({ value }: { value: CaseRecord }) {
  return (
    <section className="readback-panel" aria-labelledby="readback-title">
      <div className="panel-heading readback-heading">
        <div>
          <p className="eyebrow">Authoritative contract readback</p>
          <h2 id="readback-title">{stateTitles[value.state]}</h2>
        </div>
        <StatusBadge state={value.state} />
      </div>

      {value.reason && <p className="decision-reason">{value.reason}</p>}

      <div className="criteria-grid">
        {(Object.keys(criteriaLabels) as Array<keyof CaseRecord["criteria"]>).map((criterion) => (
          <div className="criterion" key={criterion}>
            <span className={value.criteria[criterion] ? "criterion-pass" : "criterion-open"}>
              {value.criteria[criterion] ? "✓" : "–"}
            </span>
            <span>{criteriaLabels[criterion]}</span>
          </div>
        ))}
      </div>

      <dl className="readback-grid">
        <div><dt>Case</dt><dd>#{value.case_id}</dd></div>
        <div><dt>Schema</dt><dd>{value.schema_version}</dd></div>
        <div><dt>Policy</dt><dd>{value.policy_version}</dd></div>
        <div><dt>Submitter</dt><dd className="mono" title={value.submitter}>{value.submitter}</dd></div>
        <div><dt>Resolver</dt><dd className="mono" title={value.resolver}>{value.resolver || "—"}</dd></div>
        <div><dt>Submitted</dt><dd title={value.submitted_at}>{value.submitted_at}</dd></div>
        <div><dt>Observed</dt><dd title={value.observed_at}>{value.observed_at || "—"}</dd></div>
        <div><dt>Resolved</dt><dd>{value.resolved_at || "—"}</dd></div>
        <div><dt>Repository</dt><dd>{value.repository}</dd></div>
        <div><dt>Commit</dt><dd className="mono" title={value.commit_sha}>{short(value.commit_sha)}</dd></div>
        <div><dt>Artifact</dt><dd>{value.artifact_path}</dd></div>
        <div><dt>Evidence hash</dt><dd className="mono" title={value.evidence_hash}>{short(value.evidence_hash)}</dd></div>
        <div className="binding-field"><dt>Binding</dt><dd className="mono" title={value.binding}>{value.binding}</dd></div>
      </dl>

      <a className="source-link" href={value.canonical_url} rel="noreferrer" target="_blank">
        Inspect pinned source <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
