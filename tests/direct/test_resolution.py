import json

import pytest
from gltest.direct import create_address

from conftest import CONTRACT_PATH
from fixtures.evidence import (
    ARTIFACT_PATH,
    COMMIT_SHA,
    EVIDENCE_HASH,
    REPOSITORY,
    install_failure_mocks,
    install_rejected_mocks,
    install_verified_mocks,
)


def submit_bound_case(contract):
    return contract.submit_case(
        REPOSITORY,
        COMMIT_SHA,
        ARTIFACT_PATH,
        EVIDENCE_HASH,
    )


def read_case(contract, case_id):
    return json.loads(contract.get_case(case_id))


def test_resolve_verified_requires_all_criteria(direct_vm, direct_deploy):
    """Catches a verified outcome that omits any mandatory policy criterion."""
    install_verified_mocks(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    case_id = submit_bound_case(contract)

    contract.resolve_case(case_id)

    case = read_case(contract, case_id)
    assert case["reason"] != ""
    assert case["state"] == "VERIFIED", case
    assert case["outcome"] == "VERIFIED"
    assert case["criteria"] == {
        "question": True,
        "procedure": True,
        "results": True,
        "limitations": True,
    }
    assert case["resolver"] != ""
    assert case["resolved_at"] != ""
    assert direct_vm.run_validator() is True


def test_validator_rejects_same_shape_with_different_semantics(
    direct_vm,
    direct_deploy,
):
    """Catches validators that approve JSON shape instead of the policy result."""
    install_verified_mocks(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    case_id = submit_bound_case(contract)
    contract.resolve_case(case_id)

    direct_vm.clear_mocks()
    install_rejected_mocks(direct_vm)

    assert direct_vm.run_validator() is False


def test_replayed_resolution_is_rejected_without_changing_readback(
    direct_vm,
    direct_deploy,
):
    """Catches repeated execution that overwrites an already terminal result."""
    install_verified_mocks(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    case_id = submit_bound_case(contract)
    contract.resolve_case(case_id)
    finalized = read_case(contract, case_id)

    with direct_vm.expect_revert("Case is already terminal"):
        contract.resolve_case(case_id)

    assert read_case(contract, case_id) == finalized


@pytest.mark.parametrize(
    "failure",
    [
        "http_404",
        "hash_mismatch",
        "malformed_json",
        "identity_mismatch",
        "contradictory",
    ],
)
def test_evidence_failures_are_unresolved(
    direct_vm,
    direct_deploy,
    failure,
):
    """Catches evidence failures that silently become approval or rejection."""
    install_failure_mocks(direct_vm, failure)
    contract = direct_deploy(CONTRACT_PATH)
    case_id = submit_bound_case(contract)

    contract.resolve_case(case_id)

    case = read_case(contract, case_id)
    assert case["state"] == "UNRESOLVED"
    assert case["outcome"] == "UNRESOLVED"
    assert not any(case["criteria"].values())


def test_resolution_after_thirty_days_is_rejected(
    direct_vm,
    direct_deploy,
):
    """Catches stale source availability being treated as indefinitely fresh."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    install_verified_mocks(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    case_id = submit_bound_case(contract)
    direct_vm.warp("2026-02-01T00:00:01Z")

    with direct_vm.expect_revert("Resolution window expired"):
        contract.resolve_case(case_id)

    assert read_case(contract, case_id)["state"] == "SUBMITTED"


def test_rejected_decision_is_terminal(direct_vm, direct_deploy):
    """Catches a supported negative decision being left pending."""
    install_rejected_mocks(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    case_id = submit_bound_case(contract)

    contract.resolve_case(case_id)

    case = read_case(contract, case_id)
    assert case["state"] == "REJECTED"
    assert case["criteria"]["limitations"] is False


def test_unrelated_wallet_can_resolve_without_selecting_outcome(
    direct_vm,
    direct_deploy,
):
    """Catches accidental submitter-only resolution in a permissionless workflow."""
    install_verified_mocks(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    case_id = submit_bound_case(contract)
    third_party = create_address("independent-resolver")
    direct_vm.sender = third_party

    contract.resolve_case(case_id)

    case = read_case(contract, case_id)
    assert case["resolver"] == third_party.as_hex
    assert case["state"] == "VERIFIED"
