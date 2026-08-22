import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseReadback } from "./CaseReadback";
import { CaseWorkspace, type WorkspacePhase } from "./CaseWorkspace";
import type { CaseRecord } from "../../contract/types";


const expectedLabels: Array<[WorkspacePhase, string]> = [
  ["disconnected", "Connect wallet to submit"],
  ["signing", "Confirm in wallet"],
  ["pending", "Consensus in progress"],
  ["finalized", "Transaction finalized"],
  ["execution_error", "Execution failed"],
];

describe("CaseWorkspace", () => {
  it.each(expectedLabels)("renders %s distinctly", (phase, label) => {
    render(<CaseWorkspace initialPhase={phase} />);
    expect(screen.getByText(label)).toBeVisible();
  });

  it("prevents submission before wallet connection", () => {
    render(<CaseWorkspace initialPhase="disconnected" />);
    expect(screen.getByRole("button", { name: "Submit evidence" })).toBeDisabled();
  });

  it("enables submission when the wallet connects after initial render", () => {
    const view = render(<CaseWorkspace initialPhase="disconnected" />);
    view.rerender(<CaseWorkspace initialPhase="idle" />);
    expect(screen.getByRole("button", { name: "Submit evidence" })).toBeEnabled();
  });

  it("shows field errors without issuing a write", () => {
    render(<CaseWorkspace initialPhase="idle" />);
    fireEvent.click(screen.getByRole("button", { name: "Submit evidence" }));
    expect(screen.getByText("Enter owner/repository")).toBeVisible();
    expect(screen.getByText("Enter an exact 40-character commit SHA")).toBeVisible();
  });

  it("does not invent recent cases or metrics", () => {
    render(<CaseWorkspace initialPhase="idle" />);
    expect(screen.queryByText(/total cases/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/case #/i)).not.toBeInTheDocument();
  });

  it("shows authoritative readback after a finalized successful submission", async () => {
    const submitted: CaseRecord = {
      case_id: 1,
      submitter: `0x${"1".repeat(40)}`,
      repository: "openscience/trial-a",
      commit_sha: "a".repeat(40),
      artifact_path: "reports/reproduction.md",
      evidence_hash: "b".repeat(64),
      binding: "releaseproof-case-v1|reproducibility-v1|evidence",
      schema_version: "releaseproof-case-v1",
      policy_version: "reproducibility-v1",
      submitted_at: "2026-01-01T00:00:00Z",
      state: "SUBMITTED",
      outcome: "",
      reason: "",
      criteria: {
        question: false,
        procedure: false,
        results: false,
        limitations: false,
      },
      resolver: "",
      resolved_at: "",
      canonical_url: "https://raw.githubusercontent.com/openscience/trial-a/a/report.md",
    };
    const api = {
      submitCase: vi.fn().mockResolvedValue(`0x${"f".repeat(64)}`),
      resolveCase: vi.fn(),
      readCase: vi.fn().mockResolvedValue(submitted),
      getCaseIdByBinding: vi.fn().mockResolvedValue(1),
      waitForReceipt: vi.fn().mockResolvedValue({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
    };
    render(<CaseWorkspace initialPhase="idle" contractApi={api} />);

    fireEvent.change(screen.getByLabelText("GitHub repository"), {
      target: { value: "openscience/trial-a" },
    });
    fireEvent.change(screen.getByLabelText("Commit SHA"), {
      target: { value: "a".repeat(40) },
    });
    fireEvent.change(screen.getByLabelText("Markdown path"), {
      target: { value: "reports/reproduction.md" },
    });
    fireEvent.change(screen.getByLabelText("Evidence SHA-256"), {
      target: { value: "b".repeat(64) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit evidence" }));

    expect(await screen.findByText("Submitted for review")).toBeVisible();
    expect(screen.getByText("Authoritative contract readback")).toBeVisible();
    expect(api.submitCase).toHaveBeenCalledTimes(1);
  });
});

describe("CaseReadback", () => {
  it("renders contract UNRESOLVED separately from execution error", () => {
    const unresolved: CaseRecord = {
      case_id: 7,
      submitter: `0x${"1".repeat(40)}`,
      repository: "openscience/trial-a",
      commit_sha: "a".repeat(40),
      artifact_path: "reports/reproduction.md",
      evidence_hash: "b".repeat(64),
      binding: "releaseproof-case-v1|reproducibility-v1|evidence",
      schema_version: "releaseproof-case-v1",
      policy_version: "reproducibility-v1",
      submitted_at: "2026-01-01T00:00:00Z",
      state: "UNRESOLVED",
      outcome: "UNRESOLVED",
      reason: "Validators could not establish a safe decision.",
      criteria: {
        question: false,
        procedure: false,
        results: false,
        limitations: false,
      },
      resolver: `0x${"2".repeat(40)}`,
      resolved_at: "2026-01-01T00:01:00Z",
      canonical_url: "https://raw.githubusercontent.com/openscience/trial-a/a/report.md",
    };

    render(<CaseReadback value={unresolved} />);
    expect(screen.getByText("Unresolved evidence")).toBeVisible();
    expect(screen.queryByText("Execution failed")).not.toBeInTheDocument();
    expect(screen.getByText("Validators could not establish a safe decision.")).toBeVisible();
  });
});
