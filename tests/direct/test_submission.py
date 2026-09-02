import json

import pytest

from conftest import CONTRACT_PATH
from fixtures.evidence import (
    ARTIFACT_PATH,
    COMMIT_SHA,
    EVIDENCE_HASH,
    REPOSITORY,
)


VALID_REPOSITORY = "OpenScience/Trial-A"
VALID_SHA = "a" * 40
VALID_PATH = "reports/reproduction.md"
VALID_DIGEST = "b" * 64


def test_submit_stores_immutable_binding(direct_vm, direct_deploy):
    """Catches a submission record without its versioned replay domain."""
    contract = direct_deploy(CONTRACT_PATH)

    case_id = contract.submit_case(
        REPOSITORY,
        COMMIT_SHA,
        ARTIFACT_PATH,
        EVIDENCE_HASH,
    )

    case = json.loads(contract.get_case(case_id))
    assert case["case_id"] == 1
    assert case["repository"] == REPOSITORY
    assert case["commit_sha"] == COMMIT_SHA
    assert case["artifact_path"] == ARTIFACT_PATH
    assert case["evidence_hash"] == EVIDENCE_HASH
    assert case["state"] == "SUBMITTED"
    assert case["outcome"] == ""
    assert case["criteria"] == {
        "question": False,
        "procedure": False,
        "results": False,
        "limitations": False,
    }
    assert case["policy_version"] == "reproducibility-v1"
    assert case["schema_version"] == "releaseproof-case-v2"
    assert case["binding"] == "|".join([
        "releaseproof-case-v2",
        "reproducibility-v1",
        "submit_case",
        REPOSITORY,
        COMMIT_SHA,
        ARTIFACT_PATH,
        EVIDENCE_HASH,
    ])
    assert case["observed_at"] == ""
    assert contract.get_case_count() == 1
    assert contract.get_case_id_by_binding(case["binding"]) == 1


@pytest.mark.parametrize(
    "repository,sha,path,digest,message",
    [
        ("owner", VALID_SHA, "report.md", VALID_DIGEST, "Invalid repository"),
        ("owner/repo", "abc", "report.md", VALID_DIGEST, "Invalid commit SHA"),
        (
            "owner/repo",
            VALID_SHA,
            "../report.md",
            VALID_DIGEST,
            "Invalid artifact path",
        ),
        (
            "owner/repo",
            VALID_SHA,
            "reports/./report.md",
            VALID_DIGEST,
            "Invalid artifact path",
        ),
        (
            "owner/repo",
            VALID_SHA,
            "report.md",
            "bad",
            "Invalid evidence hash",
        ),
    ],
)
def test_submit_rejects_invalid_binding(
    direct_vm,
    direct_deploy,
    repository,
    sha,
    path,
    digest,
    message,
):
    """Catches acceptance of a mutable, ambiguous, or unbound subject."""
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert(message):
        contract.submit_case(repository, sha, path, digest)


def test_duplicate_binding_is_rejected_without_allocating_an_id(
    direct_vm,
    direct_deploy,
):
    """Catches replay that creates a second case for the same evidence domain."""
    contract = direct_deploy(CONTRACT_PATH)
    contract.submit_case(VALID_REPOSITORY, VALID_SHA, VALID_PATH, VALID_DIGEST)

    with direct_vm.expect_revert("Evidence binding already exists"):
        contract.submit_case(
            VALID_REPOSITORY.lower(),
            VALID_SHA.upper(),
            VALID_PATH,
            VALID_DIGEST.upper(),
        )

    assert contract.get_case_count() == 1


def test_unknown_case_read_is_rejected(direct_vm, direct_deploy):
    """Catches default-object readback for a case that was never submitted."""
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert("Case not found"):
        contract.get_case(1)
