# v0.1.0
# { "Depends": "py-genlayer:latest" }

from dataclasses import dataclass
import json
import re

import genlayer as genlayer_sdk
from genlayer import gl


SCHEMA_VERSION = "releaseproof-case-v1"
POLICY_VERSION = "reproducibility-v1"
SUBMITTED = "SUBMITTED"

_REPOSITORY_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$")
_HEX_40_RE = re.compile(r"^[0-9a-fA-F]{40}$")
_HEX_64_RE = re.compile(r"^[0-9a-fA-F]{64}$")
_PATH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}\.md$")


@genlayer_sdk.allow_storage
@dataclass
class CaseRecord:
    case_id: genlayer_sdk.u256
    submitter: genlayer_sdk.Address
    repository: str
    commit_sha: str
    artifact_path: str
    evidence_hash: str
    binding: str
    schema_version: str
    policy_version: str
    submitted_at: str
    state: str
    outcome: str
    reason: str
    criteria_json: str
    resolver: str
    resolved_at: str
    canonical_url: str


class ReleaseProof(gl.Contract):
    next_case_id: genlayer_sdk.u256
    cases: genlayer_sdk.TreeMap[genlayer_sdk.u256, CaseRecord]
    binding_ids: genlayer_sdk.TreeMap[str, genlayer_sdk.u256]

    def __init__(self):
        self.next_case_id = genlayer_sdk.u256(1)

    @gl.public.write
    def submit_case(
        self,
        repository: str,
        commit_sha: str,
        artifact_path: str,
        evidence_hash: str,
    ) -> int:
        repository_normalized = repository.strip().lower()
        commit_normalized = commit_sha.strip().lower()
        artifact_normalized = artifact_path.strip()
        digest_normalized = evidence_hash.strip().lower()

        if _REPOSITORY_RE.fullmatch(repository_normalized) is None:
            raise ValueError("Invalid repository")
        if _HEX_40_RE.fullmatch(commit_normalized) is None:
            raise ValueError("Invalid commit SHA")
        if (
            _PATH_RE.fullmatch(artifact_normalized) is None
            or ".." in artifact_normalized.split("/")
            or "//" in artifact_normalized
        ):
            raise ValueError("Invalid artifact path")
        if _HEX_64_RE.fullmatch(digest_normalized) is None:
            raise ValueError("Invalid evidence hash")

        binding = "|".join(
            [
                SCHEMA_VERSION,
                POLICY_VERSION,
                repository_normalized,
                commit_normalized,
                artifact_normalized,
                digest_normalized,
            ]
        )
        if self.binding_ids.get(binding, None) is not None:
            raise ValueError("Evidence binding already exists")

        case_id = self.next_case_id
        self.next_case_id += 1
        canonical_url = (
            "https://raw.githubusercontent.com/"
            + repository_normalized
            + "/"
            + commit_normalized
            + "/"
            + artifact_normalized
        )
        record = CaseRecord(
            case_id=case_id,
            submitter=gl.message.sender_address,
            repository=repository_normalized,
            commit_sha=commit_normalized,
            artifact_path=artifact_normalized,
            evidence_hash=digest_normalized,
            binding=binding,
            schema_version=SCHEMA_VERSION,
            policy_version=POLICY_VERSION,
            submitted_at=gl.message_raw["datetime"],
            state=SUBMITTED,
            outcome="",
            reason="",
            criteria_json="{}",
            resolver="",
            resolved_at="",
            canonical_url=canonical_url,
        )
        self.cases[case_id] = record
        self.binding_ids[binding] = case_id
        return int(case_id)

    @gl.public.view
    def get_case(self, case_id: int) -> str:
        record = self._get_case(case_id)
        return json.dumps(
            {
                "case_id": int(record.case_id),
                "submitter": record.submitter.as_hex,
                "repository": record.repository,
                "commit_sha": record.commit_sha,
                "artifact_path": record.artifact_path,
                "evidence_hash": record.evidence_hash,
                "binding": record.binding,
                "schema_version": record.schema_version,
                "policy_version": record.policy_version,
                "submitted_at": record.submitted_at,
                "state": record.state,
                "outcome": record.outcome,
                "reason": record.reason,
                "criteria": json.loads(record.criteria_json),
                "resolver": record.resolver,
                "resolved_at": record.resolved_at,
                "canonical_url": record.canonical_url,
            },
            separators=(",", ":"),
            sort_keys=True,
        )

    @gl.public.view
    def get_case_count(self) -> int:
        return int(self.next_case_id) - 1

    @gl.public.view
    def get_case_id_by_binding(self, binding: str) -> int:
        case_id = self.binding_ids.get(binding, None)
        if case_id is None:
            return 0
        return int(case_id)

    def _get_case(self, case_id: int) -> CaseRecord:
        record = self.cases.get(genlayer_sdk.u256(case_id), None)
        if record is None:
            raise ValueError("Case not found")
        return record
