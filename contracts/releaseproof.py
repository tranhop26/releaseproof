# v0.1.0
# { "Depends": "py-genlayer:latest" }

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import re

import genlayer as genlayer_sdk
from genlayer import gl


SCHEMA_VERSION = "releaseproof-case-v1"
POLICY_VERSION = "reproducibility-v1"
SUBMITTED = "SUBMITTED"
VERIFIED = "VERIFIED"
REJECTED = "REJECTED"
UNRESOLVED = "UNRESOLVED"
_TERMINAL_STATES = (VERIFIED, REJECTED, UNRESOLVED)
_CRITERION_NAMES = ("question", "procedure", "results", "limitations")

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
            criteria_json=json.dumps(
                {name: False for name in _CRITERION_NAMES},
                separators=(",", ":"),
                sort_keys=True,
            ),
            resolver="",
            resolved_at="",
            canonical_url=canonical_url,
        )
        self.cases[case_id] = record
        self.binding_ids[binding] = case_id
        return int(case_id)

    @gl.public.write
    def resolve_case(self, case_id: int) -> None:
        record = self._get_case(case_id)
        if record.state in _TERMINAL_STATES:
            raise ValueError("Case is already terminal")
        submitted_at = _parse_datetime(record.submitted_at)
        current_time = _parse_datetime(gl.message_raw["datetime"])
        if (current_time - submitted_at).total_seconds() > 30 * 24 * 60 * 60:
            raise ValueError("Resolution window expired")

        repository = record.repository
        commit_sha = record.commit_sha
        artifact_path = record.artifact_path
        evidence_hash = record.evidence_hash
        canonical_url = record.canonical_url

        def unresolved(reason: str) -> dict:
            return {
                "outcome": UNRESOLVED,
                "criteria": {name: False for name in _CRITERION_NAMES},
                "reason": reason[:280],
                "observed_repository": repository,
                "observed_commit": commit_sha,
                "observed_path": artifact_path,
            }

        def leader_fn() -> dict:
            try:
                response = gl.nondet.web.get(canonical_url)
                if response.status != 200:
                    return unresolved("Pinned evidence could not be fetched")
                if not response.body or len(response.body) > 32 * 1024:
                    return unresolved("Pinned evidence has an invalid size")
                if hashlib.sha256(response.body).hexdigest() != evidence_hash:
                    return unresolved("Pinned evidence hash does not match")
                markdown = response.body.decode("utf-8")
                prompt = _build_policy_prompt(
                    repository,
                    commit_sha,
                    artifact_path,
                    markdown,
                )
                return _normalize_decision(
                    gl.nondet.exec_prompt(prompt, response_format="json"),
                    repository,
                    commit_sha,
                    artifact_path,
                )
            except Exception:
                return unresolved("Evidence evaluation failed safely")

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            validator_result = leader_fn()
            proposed = leader_result.calldata
            return _semantic_decision_key(proposed) == _semantic_decision_key(
                validator_result
            )

        decision = gl.vm.run_nondet(leader_fn, validator_fn)
        record.state = decision["outcome"]
        record.outcome = decision["outcome"]
        record.reason = decision["reason"]
        record.criteria_json = json.dumps(
            decision["criteria"], separators=(",", ":"), sort_keys=True
        )
        record.resolver = gl.message.sender_address.as_hex
        record.resolved_at = gl.message_raw["datetime"]

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


def _build_policy_prompt(
    repository: str,
    commit_sha: str,
    artifact_path: str,
    markdown: str,
) -> str:
    return f"""
Apply Reproducibility Policy v1 to the pinned research artifact below.

Policy criteria:
1. question: a clearly stated research question or hypothesis;
2. procedure: a concrete procedure with dependencies or environment information;
3. results: results or outputs linked to that procedure;
4. limitations: limitations, failure conditions, or known constraints.

Return only one JSON object with this exact shape:
{{
  "outcome": "VERIFIED|REJECTED|UNRESOLVED",
  "criteria": {{"question": true, "procedure": true, "results": true, "limitations": true}},
  "reason": "one concise evidence-grounded explanation",
  "observed_repository": "{repository}",
  "observed_commit": "{commit_sha}",
  "observed_path": "{artifact_path}"
}}

Use VERIFIED only when every criterion is supported. Use REJECTED when the
artifact is readable but at least one criterion is unsupported. Use UNRESOLVED
when the evidence is ambiguous, contradictory, or cannot support a safe decision.

<artifact>
{markdown}
</artifact>
"""


def _normalize_decision(
    raw_result,
    repository: str,
    commit_sha: str,
    artifact_path: str,
) -> dict:
    fallback = {
        "outcome": UNRESOLVED,
        "criteria": {name: False for name in _CRITERION_NAMES},
        "reason": "Validator response was malformed or contradictory",
        "observed_repository": repository,
        "observed_commit": commit_sha,
        "observed_path": artifact_path,
    }
    try:
        decision = json.loads(raw_result) if isinstance(raw_result, str) else raw_result
        if not isinstance(decision, dict):
            return fallback
        outcome = decision.get("outcome")
        criteria = decision.get("criteria")
        reason = decision.get("reason")
        if outcome not in _TERMINAL_STATES or not isinstance(criteria, dict):
            return fallback
        if set(criteria.keys()) != set(_CRITERION_NAMES):
            return fallback
        if any(type(criteria[name]) is not bool for name in _CRITERION_NAMES):
            return fallback
        if not isinstance(reason, str) or not reason.strip():
            return fallback
        if (
            decision.get("observed_repository") != repository
            or decision.get("observed_commit") != commit_sha
            or decision.get("observed_path") != artifact_path
        ):
            return fallback
        all_supported = all(criteria[name] for name in _CRITERION_NAMES)
        if outcome == VERIFIED and not all_supported:
            return fallback
        if outcome == REJECTED and all_supported:
            return fallback
        if outcome == UNRESOLVED:
            criteria = {name: False for name in _CRITERION_NAMES}
        return {
            "outcome": outcome,
            "criteria": criteria,
            "reason": reason.strip()[:280],
            "observed_repository": repository,
            "observed_commit": commit_sha,
            "observed_path": artifact_path,
        }
    except (TypeError, ValueError, KeyError):
        return fallback


def _parse_datetime(value: str) -> datetime:
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _semantic_decision_key(decision: dict) -> str:
    criteria = decision["criteria"]
    return "|".join(
        [
            decision["outcome"],
            "1" if criteria["question"] else "0",
            "1" if criteria["procedure"] else "0",
            "1" if criteria["results"] else "0",
            "1" if criteria["limitations"] else "0",
            decision["observed_repository"],
            decision["observed_commit"],
            decision["observed_path"],
        ]
    )
