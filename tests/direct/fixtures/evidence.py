import hashlib
import json


REPOSITORY = "openscience/trial-a"
COMMIT_SHA = "a" * 40
ARTIFACT_PATH = "reports/reproduction.md"
EVIDENCE_BODY = """# Trial A reproduction

## Research question
Does the fixed treatment reduce the registered outcome compared with control?

## Procedure
Use Python 3.12, install dependencies from requirements.txt, then run
`python analysis.py --seed 7 data/input.csv`.

## Results
The generated `results/summary.csv` reports the preregistered effect estimate
and is produced by the command above.

## Limitations
The small single-site sample limits generalization, and missing input data
causes the analysis to stop without an estimate.
"""
EVIDENCE_HASH = hashlib.sha256(EVIDENCE_BODY.encode("utf-8")).hexdigest()


def decision(outcome="VERIFIED", observed_path=ARTIFACT_PATH, **criteria_overrides):
    criteria = {
        "question": True,
        "procedure": True,
        "results": True,
        "limitations": True,
    }
    criteria.update(criteria_overrides)
    return json.dumps(
        {
            "outcome": outcome,
            "criteria": criteria,
            "reason": "The pinned artifact supports the policy decision.",
            "observed_repository": REPOSITORY,
            "observed_commit": COMMIT_SHA,
            "observed_path": observed_path,
        }
    )


def install_verified_mocks(direct_vm):
    direct_vm.mock_web(
        r"raw\.githubusercontent\.com/openscience/trial-a/",
        {"status": 200, "body": EVIDENCE_BODY, "method": "GET"},
    )
    direct_vm.mock_llm(r"Reproducibility Policy v1", decision())


def install_rejected_mocks(direct_vm):
    direct_vm.mock_web(
        r"raw\.githubusercontent\.com/openscience/trial-a/",
        {"status": 200, "body": EVIDENCE_BODY, "method": "GET"},
    )
    direct_vm.mock_llm(
        r"Reproducibility Policy v1",
        decision(outcome="REJECTED", limitations=False),
    )


def install_failure_mocks(direct_vm, failure):
    if failure == "http_404":
        direct_vm.mock_web(
            r"raw\.githubusercontent\.com/openscience/trial-a/",
            {"status": 404, "body": "not found", "method": "GET"},
        )
        return

    body = EVIDENCE_BODY if failure != "hash_mismatch" else "tampered evidence"
    direct_vm.mock_web(
        r"raw\.githubusercontent\.com/openscience/trial-a/",
        {"status": 200, "body": body, "method": "GET"},
    )
    responses = {
        "hash_mismatch": decision(),
        "malformed_json": "not-json",
        "identity_mismatch": decision(observed_path="reports/other.md"),
        "contradictory": decision(outcome="VERIFIED", limitations=False),
    }
    direct_vm.mock_llm(r"Reproducibility Policy v1", responses[failure])
