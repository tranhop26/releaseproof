# ReleaseProof Design

## Scope

ReleaseProof is a GenLayer MVP that records whether a research artifact pinned to an immutable GitHub commit satisfies a fixed reproducibility policy. It does not reproduce the experiment, assess scientific truth, transfer funds, or rank research quality.

The MVP supports one complete flow: a wallet submits a case, any wallet can request resolution once, GenLayer validators evaluate the pinned evidence, and the contract permanently records `VERIFIED`, `REJECTED`, or `UNRESOLVED` with a readback-safe explanation.

## Trust model

| Actor | Cannot trust | Can manipulate | Contract defense | Test/evidence |
|---|---|---|---|---|
| Researcher | A single reviewer or frontend operator | Mutable branch contents, prose claims, omitted files | Require repository owner/name, 40-character commit SHA, artifact path, evidence hash, and fixed policy version | Reject malformed/missing bindings; direct tests for replay and mismatched identity |
| Reader/funder | Researcher | Self-select a favorable result or later change evidence | Validators fetch only the canonical GitHub API/raw URLs derived by the contract from the pinned commit | Integration readback shows stored source binding and terminal result |
| Resolver | Researcher and frontend | Call repeatedly, substitute evidence, or choose outcome | Resolver supplies only `case_id`; contract loads immutable evidence and computes the decision | Unauthorized mutation is impossible; repeated resolve and terminal replay tests |
| Validator | Leader validator | Return plausible JSON with a different semantic judgment | Validator independently fetches the same evidence and compares policy outcome plus criterion-level booleans | Consensus disagreement produces no favorable default and is covered by direct tests |
| Contract owner/deployer | All users | Upgrade logic or rewrite a result | `INTENTIONALLY_FROZEN`; no owner, admin, upgrade, delete, or result-edit method | Schema/source review and tests prove privileged paths do not exist |

## Decision and consequence

GenLayer establishes this exact decision:

> At the pinned GitHub commit, does the declared artifact satisfy every mandatory criterion in Reproducibility Policy v1, based only on the bound repository evidence?

Policy v1 requires all four semantic criteria:

1. a clearly stated research question or hypothesis;
2. a concrete procedure with dependencies or environment information;
3. results or outputs linked to the procedure;
4. limitations, failure conditions, or known constraints.

The on-chain consequence is a permanent terminal case result:

- `VERIFIED` when every criterion is supported;
- `REJECTED` when evidence is available and at least one criterion is demonstrably not supported;
- `UNRESOLVED` when evidence cannot safely support either conclusion, including unavailable, malformed, contradictory, stale-at-submission, identity-mismatched evidence, or validator consensus failure.

No caller, owner, backend, or frontend can select or edit the outcome.

## Evidence binding

Each case stores:

- source: GitHub only, accessed through canonical HTTPS API/raw endpoints;
- subject: lowercase `owner/repository` plus exact 40-character commit SHA;
- artifact identity: normalized repository-relative Markdown path;
- submitter: transaction sender;
- schema/content version: `releaseproof-case-v1`;
- policy version: `reproducibility-v1`;
- observation time: validator fetch time reported in the decision explanation;
- submission time: GenLayer transaction time stored by the contract;
- freshness: the commit itself is immutable; resolution must occur within 30 days of submission so source availability is not treated as indefinitely fresh;
- replay domain: chain ID + contract address + case ID + repository + commit SHA + artifact path + policy version;
- integrity: contract-derived canonical URL and a stored deterministic binding string/hash supplied at creation and rechecked before resolution.

The contract never accepts an arbitrary fetch URL. Missing, oversized, non-text, inaccessible, redirected outside approved GitHub hosts, commit-mismatched, or ambiguous evidence resolves safely to `UNRESOLVED` or rejects before consensus, depending on whether the defect is structural or environmental.

## State machine

| From | Actor | Method | Preconditions | On-chain effect | To | Replay behavior |
|---|---|---|---|---|---|---|
| none | Any connected wallet | `submit_case(...)` | Valid binding fields; unique binding; future-safe timestamp | Stores immutable evidence and submitter; allocates case ID | `SUBMITTED` | Duplicate binding rejected |
| `SUBMITTED` | Any connected wallet | `resolve_case(case_id)` | Case exists; within 30 days; not previously requested | Marks resolution attempt and runs validator consensus over stored evidence | `VERIFIED`, `REJECTED`, or `UNRESOLVED` | Second call rejected |
| terminal | Any wallet | view methods | Case exists | No mutation; returns authoritative state and binding | unchanged | Idempotent read |

`PENDING_CONSENSUS`, transaction `FINALIZED`, execution `SUCCESS`, and readback are transaction/UI phases rather than separately writable domain states. The frontend never displays a terminal result until the finalized receipt succeeds and a contract read returns that terminal state.

## Intelligent Contract

One Python Intelligent Contract is the source of truth. Planned public interface:

- `submit_case(repository, commit_sha, artifact_path, evidence_hash) -> case_id`
- `resolve_case(case_id)`
- `get_case(case_id) -> JSON`
- `get_case_count() -> int`
- `get_case_id_by_binding(binding) -> int`

The nondeterministic leader fetches bound evidence and returns a strict decision object containing outcome, four criterion booleans, concise reason, and observed source identity. Validators independently fetch the same pinned artifact, evaluate the same policy, and require semantic equivalence on outcome and every criterion—not merely valid JSON shape. Any runtime or consensus failure must not write `VERIFIED`.

The contract is `INTENTIONALLY_FROZEN`. Recovery is migration: deploy a versioned successor, publish a manifest linking predecessor and successor, and preserve old cases as immutable read-only history. There is no privileged upgrade path.

## Frontend and workflow

The responsive frontend is a focused single-page application with three areas: wallet/network header, submit/resolve workspace, and authoritative case readback. It uses `genlayer-js` directly from the browser; there is no outcome backend and no mock data in production paths.

Distinct UI states:

- wallet disconnected: explanatory empty state and disabled writes;
- connected/ready: validated submission form and case lookup;
- wallet signature/loading: transaction submitted but not yet accepted;
- pending consensus: accepted and awaiting finality;
- finalized: receipt reached finality;
- execution success: receipt indicates successful contract execution;
- execution error or `UNRESOLVED`: visually distinct, actionable explanation;
- readback: contract-returned binding, terminal badge, reason, timestamps, transaction link, and resolver.

Retries only re-read receipts/state; they never resubmit a write automatically. A page refresh reconciles from the transaction hash and contract state.

Visual direction will be researched independently before UI implementation: calm scientific registry, high-contrast status chips, compact evidence cards, and mobile-first layout. Reference sites influence visual hierarchy only, not functionality or copy.

## Architecture and repository structure

```text
releaseproof/
├── contracts/                 # GenLayer source of truth
├── tests/direct/              # Contract logic and adversarial branches
├── tests/integration/         # Real frontend-client-to-contract workflow
├── app/                       # Vite/TypeScript responsive frontend
│   ├── src/contract/          # genlayer-js adapter and receipt reconciliation
│   ├── src/features/cases/    # submit, resolve, and readback UI
│   └── src/ui/                # accessible reusable presentation components
├── scripts/                   # deploy and post-deploy readback verification
├── deployments/              # versioned manifest without secrets
├── docs/                      # short runbook, plan, and fixed evidence package
├── .env.example               # names only, no real values
└── README.md
```

Environment variables provide RPC/network settings, contract address after a real deployment, and deployment credentials only at action time. No private key, token, secret, placeholder address, prompt transcript, or local instruction file is committed.

## Test strategy

Test-first development covers:

- field validation, canonicalization, unique binding, and missing evidence;
- caller permissions and absence of privileged mutations;
- invalid transitions, duplicate submission, repeated resolution, and terminal replay;
- semantic `VERIFIED`, `REJECTED`, and `UNRESOLVED` decisions;
- inaccessible, malformed, stale, mismatched, and contradictory evidence;
- validator disagreement/consensus failure with no favorable default;
- frozen-contract recovery assertions;
- frontend wallet-disconnected, pending, finalized, success, error, `UNRESOLVED`, and readback states;
- local integration from UI contract adapter through actual GenLayer test tooling, plus live Studionet happy path and one important error branch after deployment authorization.

Completion requires fresh lint, build, all direct tests, all integration tests, deployed source/address verification, one successful live transaction, one live important error transaction, finalized receipt, and contract readback.

## Explicit non-goals

- No escrow, token, stake, reward, NFT, backend outcome service, arbitrary websites, PDF parsing, experiment execution, appeals, moderation dashboard, social features, or multi-policy marketplace.
- No claim that `VERIFIED` means the scientific conclusion is true; it means only that the pinned artifact satisfies Policy v1's reproducibility disclosure requirements.
