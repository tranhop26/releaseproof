import hashlib
import json

from glsim.consensus import run_consensus
from glsim.server import create_app
from glsim.tx_decoder import encode_calldata_result, encode_result_bytes
from starlette.testclient import TestClient

from conftest import CONTRACT_PATH


REPOSITORY = "openscience/trial-a"
COMMIT_SHA = "a" * 40
ARTIFACT_PATH = "reports/reproduction.md"
EVIDENCE_BODY = """# Reproduction

## Research question
Does the registered treatment reduce the outcome?

## Procedure
Install requirements and run `python analysis.py --seed 7`.

## Results
The command produces `results/summary.csv` with the estimate.

## Limitations
The single-site sample limits generalization.
"""
EVIDENCE_HASH = hashlib.sha256(EVIDENCE_BODY.encode()).hexdigest()


def decision(outcome="VERIFIED", limitations=True):
    return json.dumps(
        {
            "outcome": outcome,
            "criteria": {
                "question": True,
                "procedure": True,
                "results": True,
                "limitations": limitations,
            },
            "observed_repository": REPOSITORY,
            "observed_commit": COMMIT_SHA,
            "observed_path": ARTIFACT_PATH,
        }
    )


def install_observation(engine, response):
    engine.vm.clear_mocks()
    engine.vm.mock_web(
        r"raw\.githubusercontent\.com/openscience/trial-a/",
        {"status": 200, "body": EVIDENCE_BODY, "method": "GET"},
    )
    engine.vm.mock_llm(r"Reproducibility Policy v1", response)


def deploy_and_submit(engine):
    address, _ = engine.deploy(CONTRACT_PATH)
    case_id = engine.call_method(
        address,
        "submit_case",
        [REPOSITORY, COMMIT_SHA, ARTIFACT_PATH, EVIDENCE_HASH],
    )
    return address, case_id


def read_case(engine, address, case_id):
    # Read through a fresh storage-backed view. glsim 0.29.2 replaces the
    # manager on rollback but leaves its cached instance bound to the old one.
    from genlayer.py.storage import ROOT_SLOT_ID
    deployed = engine._instances[address.lower()]
    type_descriptor = getattr(deployed, "__dict__", {}).get("__type_desc__")
    assert type_descriptor is not None
    storage = engine._storages[address.lower()]
    instance = type_descriptor.get(storage.get_store_slot(ROOT_SLOT_ID), 0)
    return json.loads(instance.get_case(case_id))


def test_agreeing_validators_finalize_real_contract_state():
    app = create_app(num_validators=5, max_rotations=2)
    with TestClient(app):
        engine = app.state.engine
        address, case_id = deploy_and_submit(engine)
        calldata = encode_calldata_result(
            {"method": "resolve_case", "args": [case_id]}
        )

        def execute_fn():
            install_observation(engine, decision())
            result, _ = engine.call_from_calldata(address, calldata, None)
            assert engine.vm._captured_validators
            return result, encode_result_bytes(result)

        consensus = run_consensus(engine, execute_fn, 5, 2)

        assert consensus.status.value == "FINALIZED"
        assert all(vote == "agree" for vote in consensus.votes)
        case = read_case(engine, address, case_id)

        # These assertions catch a finalized readback that regresses to v1,
        # loses the submit action from its replay domain, or timestamps only
        # one side of the terminal observation/resolution pair.
        assert case["state"] == "VERIFIED"
        assert case["schema_version"] == "releaseproof-case-v2"
        assert "|submit_case|" in case["binding"]
        assert case["observed_at"] != ""
        assert case["observed_at"] == case["resolved_at"]


def test_validator_disagreement_is_undetermined_and_preserves_submission():
    app = create_app(num_validators=5, max_rotations=2)
    with TestClient(app):
        engine = app.state.engine
        address, case_id = deploy_and_submit(engine)
        submitted_case = read_case(engine, address, case_id)
        calldata = encode_calldata_result(
            {"method": "resolve_case", "args": [case_id]}
        )

        def execute_fn():
            install_observation(engine, decision())
            result, _ = engine.call_from_calldata(address, calldata, None)
            assert engine.vm._captured_validators
            install_observation(engine, decision("REJECTED", limitations=False))
            return result, encode_result_bytes(result)

        # One complete round is sufficient to prove majority disagreement and
        # rollback. glsim 0.29.2 does not reconnect restored storage descriptors
        # before a second leader rotation on Windows.
        consensus = run_consensus(engine, execute_fn, 5, 1)
        case = read_case(engine, address, case_id)

        assert consensus.status.value == "UNDETERMINED"
        assert sum(vote == "disagree" for vote in consensus.votes) >= 3
        # A failed five-validator decision must leave the original submission
        # intact, rather than persisting any leader-only terminal fields.
        assert case == submitted_case
        assert case["state"] == "SUBMITTED"
