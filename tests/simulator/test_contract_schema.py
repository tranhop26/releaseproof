import ast
import json
from pathlib import Path

from glsim.server import create_app
from starlette.testclient import TestClient

from conftest import CONTRACT_PATH


REPOSITORY = "openscience/trial-a"
COMMIT_SHA = "a" * 40
ARTIFACT_PATH = "reports/reproduction.md"
EVIDENCE_HASH = "b" * 64


EXPECTED_METHODS = {
    "submit_case",
    "resolve_case",
    "get_case",
    "get_case_count",
    "get_case_id_by_binding",
}
FORBIDDEN_METHODS = {
    "upgrade",
    "upgrade_to",
    "set_code",
    "admin",
    "owner",
    "delete_case",
    "edit_result",
}


def test_runtime_dependency_is_content_pinned():
    source = Path(CONTRACT_PATH).read_text(encoding="utf-8")
    assert '"Depends": "py-genlayer:latest"' not in source
    assert '"Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"' in source


def test_public_schema_is_intentionally_frozen():
    app = create_app(num_validators=1, max_rotations=1)
    with TestClient(app):
        engine = app.state.engine
        address, _ = engine.deploy(CONTRACT_PATH)
        assert engine.call_method(address, "get_case_count") == 0

        module = ast.parse(Path(CONTRACT_PATH).read_text(encoding="utf-8"))
        contract = next(
            node
            for node in module.body
            if isinstance(node, ast.ClassDef) and node.name == "ReleaseProof"
        )
        method_names = {
            method.name
            for method in contract.body
            if isinstance(method, ast.FunctionDef)
            and any(
                ast.unparse(decorator) in {"gl.public.write", "gl.public.view"}
                for decorator in method.decorator_list
            )
        }

        assert method_names == EXPECTED_METHODS
        assert method_names.isdisjoint(FORBIDDEN_METHODS)


def test_public_submission_record_uses_the_v2_evidence_domain():
    """Catches public readback that omits version, action, or observation state."""
    app = create_app(num_validators=1, max_rotations=1)
    with TestClient(app):
        engine = app.state.engine
        address, _ = engine.deploy(CONTRACT_PATH)
        case_id = engine.call_method(
            address,
            "submit_case",
            [REPOSITORY, COMMIT_SHA, ARTIFACT_PATH, EVIDENCE_HASH],
        )

        case = json.loads(engine.call_method(address, "get_case", [case_id]))
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
