import { useState, type FormEvent } from "react";

import type { SubmissionInput } from "../../contract/types";


const emptyForm: SubmissionInput = {
  repository: "",
  commitSha: "",
  artifactPath: "",
  evidenceHash: "",
};

type FieldErrors = Partial<Record<keyof SubmissionInput, string>>;

function validate(value: SubmissionInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(value.repository.trim())) {
    errors.repository = "Enter owner/repository";
  }
  if (!/^[0-9a-fA-F]{40}$/.test(value.commitSha.trim())) {
    errors.commitSha = "Enter an exact 40-character commit SHA";
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*\.md$/.test(value.artifactPath.trim())) {
    errors.artifactPath = "Enter a safe Markdown path ending in .md";
  }
  if (!/^[0-9a-fA-F]{64}$/.test(value.evidenceHash.trim())) {
    errors.evidenceHash = "Enter the artifact's 64-character SHA-256";
  }
  return errors;
}

export function CaseForm({
  walletConnected,
  busy,
  onSubmit,
}: {
  walletConnected: boolean;
  busy: boolean;
  onSubmit(value: SubmissionInput): Promise<void>;
}) {
  const [value, setValue] = useState(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validate(value);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !walletConnected) return;
    await onSubmit({
      repository: value.repository.trim(),
      commitSha: value.commitSha.trim(),
      artifactPath: value.artifactPath.trim(),
      evidenceHash: value.evidenceHash.trim(),
    });
  }

  function field(
    name: keyof SubmissionInput,
    label: string,
    placeholder: string,
    hint: string,
  ) {
    const errorId = `${name}-error`;
    return (
      <label className="field">
        <span className="field-label">{label}</span>
        <input
          aria-label={label}
          aria-describedby={errors[name] ? errorId : undefined}
          aria-invalid={Boolean(errors[name])}
          autoComplete="off"
          name={name}
          onChange={(event) => setValue({ ...value, [name]: event.target.value })}
          placeholder={placeholder}
          spellCheck={false}
          value={value[name]}
        />
        {errors[name] ? (
          <span className="field-error" id={errorId}>{errors[name]}</span>
        ) : (
          <span className="field-hint">{hint}</span>
        )}
      </label>
    );
  }

  return (
    <form className="evidence-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        {field("repository", "GitHub repository", "owner/repository", "Public GitHub repository")}
        {field("commitSha", "Commit SHA", "40-character commit", "Pins an immutable source version")}
        {field("artifactPath", "Markdown path", "reports/reproduction.md", "Path inside the pinned commit")}
        {field("evidenceHash", "Evidence SHA-256", "64-character digest", "Must match the raw Markdown bytes")}
      </div>
      <div className="form-footer">
        <p>The contract derives the canonical GitHub URL. Arbitrary fetch URLs are not accepted.</p>
        <button className="primary-button" disabled={!walletConnected || busy} type="submit">
          {busy ? "Transaction in progress" : "Submit evidence"}
        </button>
      </div>
    </form>
  );
}
