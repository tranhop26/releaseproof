# ReleaseProof MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a complete GenLayer MVP that permanently records whether a GitHub-commit-pinned research artifact satisfies Reproducibility Policy v1.

**Architecture:** A single intentionally frozen Python Intelligent Contract owns immutable case bindings, validator-driven decisions, terminal state, and readback. A Vite/React/TypeScript browser app uses `genlayer-js` directly for wallet writes and authoritative reads; Python direct tests, GLSim consensus tests, TypeScript adapter tests, and Playwright UI tests cover the workflow without a result-selecting backend.

**Tech Stack:** Python 3.14, `genlayer-test==0.29.2`, GenLayer CLI `0.39.2`, `genlayer-js==1.1.8`, React `19.2.8`, Vite `8.2.2`, TypeScript `7.0.2`, Vitest `4.1.11`, Testing Library `16.3.2`, Playwright `1.62.1`, ESLint `10.9.0`, Zod `4.4.3`.

## Global Constraints

- The Intelligent Contract is the only source of final outcomes and stored evidence state.
- Policy version is exactly `reproducibility-v1`; case schema is exactly `releaseproof-case-v1`.
- Terminal outcomes are exactly `VERIFIED`, `REJECTED`, and `UNRESOLVED`; no evidence failure defaults to `VERIFIED`.
- Canonical evidence is GitHub raw content derived by the contract from lowercase `owner/repository`, exact 40-character commit SHA, and normalized Markdown artifact path.
- Contract classification is `INTENTIONALLY_FROZEN`; no owner, admin, upgrade, delete, or result-edit method may exist.
- No token, stake, escrow, reward, NFT, arbitrary fetch URL, PDF parsing, outcome backend, or production mock data.
- Production write retries are never automatic; reconciliation only polls receipt and reads contract state.
- Do not select visual references or implement final styling until the user supplies UI reference URLs at Task 5.
- Do not push GitHub, deploy a contract, or deploy Vercel before the action-time identity check and explicit user confirmation in Task 8.
- Never place a private key, token, secret, real credential, prompt transcript, or local instruction file in source, logs, commits, or README.

---

### Task 1: Repository toolchain and deterministic case submission

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `pyproject.toml`
- Create: `contracts/releaseproof.py`
- Create: `tests/direct/test_submission.py`
- Create: `tests/direct/conftest.py`
- Create: `package.json`

**Interfaces:**
- Consumes: approved design specification.
- Produces: `ReleaseProof.submit_case(repository: str, commit_sha: str, artifact_path: str, evidence_hash: str) -> int`, `get_case(case_id: int) -> str`, `get_case_count() -> int`, and `get_case_id_by_binding(binding: str) -> int`.

- [ ] **Step 1: Add the Python and repository configuration**

Create `pyproject.toml` with Python `>=3.14`, `genlayer-test==0.29.2`, pytest testpaths for `tests/direct` and `tests/simulator`, and strict markers. Create `.env.example` with empty `GENLAYER_DEPLOYER_PRIVATE_KEY`, `VITE_GENLAYER_CONTRACT_ADDRESS`, `VITE_GENLAYER_NETWORK=studionet`, and `VERCEL_TOKEN` fields. Ignore `.env*` except `.env.example`, virtual environments, caches, build output, `node_modules`, Playwright output, and `deployments/*.local.json`.

- [ ] **Step 2: Write failing submission tests**

```python
def test_submit_stores_immutable_binding(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/releaseproof.py")
    case_id = contract.submit_case(
        "OpenScience/Trial-A",
        "a" * 40,
        "reports/reproduction.md",
        "b" * 64,
    )
    case = json.loads(contract.get_case(case_id))
    assert case["repository"] == "openscience/trial-a"
    assert case["state"] == "SUBMITTED"
    assert case["policy_version"] == "reproducibility-v1"


@pytest.mark.parametrize("repository,sha,path,digest,message", [
    ("owner", "a" * 40, "report.md", "b" * 64, "Invalid repository"),
    ("owner/repo", "abc", "report.md", "b" * 64, "Invalid commit SHA"),
    ("owner/repo", "a" * 40, "../report.md", "b" * 64, "Invalid artifact path"),
    ("owner/repo", "a" * 40, "report.md", "bad", "Invalid evidence hash"),
])
def test_submit_rejects_invalid_binding(direct_vm, direct_deploy, repository, sha, path, digest, message):
    contract = direct_deploy("contracts/releaseproof.py")
    with direct_vm.expect_revert(message):
        contract.submit_case(repository, sha, path, digest)
```

- [ ] **Step 3: Run RED and confirm the contract is missing**

Run: `gltest tests/direct/test_submission.py -q`

Expected: collection or deployment fails because `contracts/releaseproof.py` does not exist.

- [ ] **Step 4: Implement the minimal storage model and deterministic validation**

Implement a `CaseRecord` dataclass stored in `gl.TreeMap[int, CaseRecord]`, start IDs at `1`, normalize only the repository to lowercase, require safe ASCII repository/path characters, `.md` suffix, SHA-1-shaped 40 hex characters, SHA-256-shaped 64 hex characters, and compute the replay binding as:

```python
binding = "|".join([
    "releaseproof-case-v1",
    "reproducibility-v1",
    repository_normalized,
    commit_sha.lower(),
    artifact_path,
    evidence_hash.lower(),
])
```

Store submitter and `gl.message_raw["datetime"]`. Reject an existing binding before allocating an ID. Return JSON with stable string/boolean values and raise `Case not found` for unknown IDs.

- [ ] **Step 5: Run GREEN and the complete direct suite**

Run: `gltest tests/direct/test_submission.py -q`

Expected: all submission tests pass with no warnings.

- [ ] **Step 6: Commit the independently working submission slice**

Run: `git add .gitignore .env.example pyproject.toml package.json contracts tests/direct && git commit -m "feat: add immutable research case submission"`

---

### Task 2: Validator decision engine, terminal transitions, and safe UNRESOLVED

**Files:**
- Modify: `contracts/releaseproof.py`
- Create: `tests/direct/test_resolution.py`
- Create: `tests/direct/fixtures/evidence.py`

**Interfaces:**
- Consumes: immutable `CaseRecord` from Task 1 and direct runner web/LLM mocks.
- Produces: `resolve_case(case_id: int) -> None`; terminal readback fields `outcome`, `reason`, `criteria`, `resolver`, `resolved_at`, and `canonical_url`.

- [ ] **Step 1: Write failing happy-path and semantic validator tests**

```python
def test_resolve_verified_requires_all_criteria(contract, direct_vm, verified_mocks):
    case_id = submit_bound_case(contract)
    contract.resolve_case(case_id)
    case = read_case(contract, case_id)
    assert case["state"] == "VERIFIED"
    assert case["criteria"] == {
        "question": True,
        "procedure": True,
        "results": True,
        "limitations": True,
    }
    assert direct_vm.run_validator() is True


def test_validator_rejects_same_shape_with_different_semantics(contract, direct_vm, verified_mocks):
    case_id = submit_bound_case(contract)
    contract.resolve_case(case_id)
    direct_vm.clear_mocks()
    install_rejected_mocks(direct_vm)
    assert direct_vm.run_validator() is False
```

- [ ] **Step 2: Run RED and confirm `resolve_case` is absent**

Run: `gltest tests/direct/test_resolution.py -k "verified or semantics" -q`

Expected: failure reports that the contract has no `resolve_case` method.

- [ ] **Step 3: Implement canonical fetch and strict decision parsing**

Derive only `https://raw.githubusercontent.com/{repository}/{commit_sha}/{artifact_path}`. In the nondeterministic leader, require HTTP 200, UTF-8 Markdown no larger than 32 KiB, and SHA-256 equality with the stored hash. Prompt for exactly:

```json
{
  "outcome": "VERIFIED|REJECTED|UNRESOLVED",
  "criteria": {"question": true, "procedure": true, "results": true, "limitations": true},
  "reason": "one concise evidence-grounded explanation",
  "observed_repository": "owner/repository",
  "observed_commit": "40-char sha",
  "observed_path": "path/to/report.md"
}
```

Normalize malformed response, fetch failure, hash mismatch, identity mismatch, or contradictory fields into an `UNRESOLVED` decision with all criteria false. Force `VERIFIED` only when all four booleans are true; force `REJECTED` only when the artifact was fetched and at least one criterion is false. The validator re-fetches/re-evaluates and compares outcome, every criterion boolean, and all three observed identity fields.

- [ ] **Step 4: Run GREEN for semantic agreement**

Run: `gltest tests/direct/test_resolution.py -k "verified or semantics" -q`

Expected: both tests pass.

- [ ] **Step 5: Add failing adversarial transition tests**

```python
def test_replayed_resolution_is_rejected(contract, direct_vm, verified_mocks):
    case_id = submit_bound_case(contract)
    contract.resolve_case(case_id)
    with direct_vm.expect_revert("Case is already terminal"):
        contract.resolve_case(case_id)


@pytest.mark.parametrize("failure", ["http_404", "hash_mismatch", "malformed_json", "identity_mismatch"])
def test_evidence_failures_are_unresolved(contract, direct_vm, failure):
    install_failure_mocks(direct_vm, failure)
    case_id = submit_bound_case(contract)
    contract.resolve_case(case_id)
    assert read_case(contract, case_id)["state"] == "UNRESOLVED"
```

Also test unknown case, duplicate binding, expired resolution after 30 days, missing data, `REJECTED`, and state/readback conservation after each rejected replay.

- [ ] **Step 6: Run RED, implement expiry and terminal guards, then run GREEN**

Run before implementation: `gltest tests/direct/test_resolution.py -q`

Expected RED: replay/expiry/failure cases fail for the named missing behavior.

Implement guards using the stored ISO submission timestamp and current message timestamp. Then rerun: `gltest tests/direct/test_resolution.py -q`.

Expected GREEN: all resolution tests pass.

- [ ] **Step 7: Commit the authoritative decision engine**

Run: `git add contracts/releaseproof.py tests/direct && git commit -m "feat: resolve reproducibility evidence by validator consensus"`

---

### Task 3: Simulator consensus, frozen classification, and integration contract proof

**Files:**
- Create: `tests/simulator/test_consensus.py`
- Create: `tests/simulator/test_contract_schema.py`
- Create: `gltest.config.yaml`
- Create: `docs/recovery.md`

**Interfaces:**
- Consumes: Task 2 contract and `glsim` multi-validator engine.
- Produces: evidence that validator disagreement is `UNDETERMINED` without favorable state mutation and that no privileged schema method exists.

- [ ] **Step 1: Write the failing simulator consensus test**

Use `glsim.server.create_app(num_validators=5, max_rotations=2)`, deploy the real contract, install distinct validator observations, execute `resolve_case` through `glsim.consensus.run_consensus`, and assert:

```python
assert consensus.status.value == "UNDETERMINED"
assert read_case_from_engine(engine, address, case_id)["state"] == "SUBMITTED"
assert read_case_from_engine(engine, address, case_id)["outcome"] == ""
```

- [ ] **Step 2: Run RED and verify disagreement currently lacks proof**

Run: `gltest tests/simulator/test_consensus.py -q`

Expected: failure until the real contract helper and validator disagreement setup are wired.

- [ ] **Step 3: Implement only test harness helpers and make consensus proof GREEN**

Do not change production behavior to fake consensus. Wire `sim_deploy`, encoded calldata, five-validator consensus, web/LLM mocks, and post-consensus readback around the real contract.

Run: `gltest tests/simulator/test_consensus.py -q`

Expected: agreeing validators finalize one terminal outcome; disagreement reports `UNDETERMINED` and preserves `SUBMITTED`.

- [ ] **Step 4: Add frozen-schema and migration-runbook assertions**

Assert the public schema contains only `submit_case`, `resolve_case`, `get_case`, `get_case_count`, and `get_case_id_by_binding`; explicitly assert these are absent: `upgrade`, `upgrade_to`, `set_code`, `admin`, `owner`, `delete_case`, `edit_result`. Write `docs/recovery.md` stating predecessor read-only preservation, successor deployment, source hash verification, manifest linkage, and frontend address cutover.

- [ ] **Step 5: Run all Python tests and commit**

Run: `gltest tests/direct tests/simulator -q`

Expected: all tests pass, zero warnings.

Run: `git add tests/simulator gltest.config.yaml docs/recovery.md && git commit -m "test: prove consensus safety and frozen recovery"`

---

### Task 4: Browser contract adapter and transaction lifecycle

**Files:**
- Create: `app/package.json`
- Create: `app/vite.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/eslint.config.js`
- Create: `app/src/contract/types.ts`
- Create: `app/src/contract/config.ts`
- Create: `app/src/contract/client.ts`
- Create: `app/src/contract/reconcile.ts`
- Create: `app/src/contract/client.test.ts`
- Create: `app/src/contract/reconcile.test.ts`

**Interfaces:**
- Consumes: `genlayer-js==1.1.8`, contract method names from Tasks 1–2, empty-or-real `VITE_GENLAYER_CONTRACT_ADDRESS`.
- Produces: `createReadClient()`, `createWalletClient(address, provider)`, `submitCase(input)`, `resolveCase(caseId)`, `readCase(caseId)`, and `reconcileTransaction(hash, expectedCaseId?)`.

- [ ] **Step 1: Scaffold exact app dependencies and scripts**

Define scripts `dev`, `build`, `lint`, `test`, `test:integration`, and `test:e2e`. Runtime dependencies are React, React DOM, `genlayer-js`, and Zod; development dependencies are Vite, TypeScript, Vitest, Testing Library, ESLint, jsdom, and Playwright at the versions in the plan header.

- [ ] **Step 2: Write failing lifecycle tests**

```typescript
it("does not read terminal state before finalized execution success", async () => {
  const api = fakeApi({receipt: {statusName: "PENDING"}});
  await expect(reconcileTransaction(api, TX_HASH, 1)).resolves.toMatchObject({phase: "pending"});
  expect(api.readCase).not.toHaveBeenCalled();
});

it("reads back only after FINISHED_WITH_RETURN", async () => {
  const api = fakeApi({receipt: finalizedSuccess(), case: verifiedCase()});
  await expect(reconcileTransaction(api, TX_HASH, 1)).resolves.toMatchObject({
    phase: "readback",
    case: {state: "VERIFIED"},
  });
});

it("keeps finalized execution errors distinct from unresolved contract outcomes", async () => {
  await expect(reconcileTransaction(errorReceiptApi(), TX_HASH, 1)).resolves.toMatchObject({phase: "execution_error"});
  await expect(reconcileTransaction(unresolvedApi(), TX_HASH, 1)).resolves.toMatchObject({phase: "readback", case: {state: "UNRESOLVED"}});
});
```

- [ ] **Step 3: Run RED**

Run: `npm --prefix app test -- --run src/contract`

Expected: modules and exported functions do not exist.

- [ ] **Step 4: Implement minimal typed client and receipt reconciliation**

Create separate read and wallet clients with the Studionet chain. Writes require an injected provider and non-empty real contract address; reads throw `Contract address is not configured` rather than using a fake address. Wait with `waitUntil: "finalized"`, require `ExecutionResult.FINISHED_WITH_RETURN`, parse `get_case` with Zod, and never automatically repeat `writeContract`.

- [ ] **Step 5: Run GREEN, typecheck, lint, and commit**

Run: `npm --prefix app test -- --run src/contract && npm --prefix app run build && npm --prefix app run lint`

Expected: lifecycle tests, TypeScript build, and lint pass.

Run: `git add app && git commit -m "feat: add safe GenLayer browser client"`

---

### Task 5: User-selected UI references and complete responsive interface

**Files:**
- Create: `app/index.html`
- Create: `app/src/main.tsx`
- Create: `app/src/App.tsx`
- Create: `app/src/features/cases/CaseForm.tsx`
- Create: `app/src/features/cases/CaseReadback.tsx`
- Create: `app/src/features/cases/TransactionTimeline.tsx`
- Create: `app/src/features/cases/CaseWorkspace.test.tsx`
- Create: `app/src/ui/StatusBadge.tsx`
- Create: `app/src/styles/tokens.css`
- Create: `app/src/styles/app.css`

**Interfaces:**
- Consumes: Task 4 adapter and UI reference URLs selected by the user at this checkpoint.
- Produces: accessible responsive submission, resolution, lifecycle, error, and authoritative readback UI.

- [ ] **Step 1: Stop and request the user's UI reference URLs**

At this exact step, report that contract/adapter foundations are ready and ask the user to choose one or more websites. Do not search for or select references on the user's behalf. Record only derived visual principles—layout density, typography mood, palette, card treatment, and motion restraint—without copying protected assets, copy, or product behavior.

- [ ] **Step 2: Write failing UI-state tests after references arrive**

```tsx
it.each([
  ["disconnected", "Connect wallet to submit"],
  ["signing", "Confirm in wallet"],
  ["pending", "Consensus in progress"],
  ["finalized", "Transaction finalized"],
  ["execution_error", "Execution failed"],
])("renders %s distinctly", (phase, label) => {
  render(<CaseWorkspace initialPhase={phase as TransactionPhase} />);
  expect(screen.getByText(label)).toBeVisible();
});

it("renders contract UNRESOLVED separately from execution error", () => {
  render(<CaseReadback value={unresolvedCase()} />);
  expect(screen.getByText("Unresolved evidence")).toBeVisible();
  expect(screen.queryByText("Execution failed")).not.toBeInTheDocument();
});
```

Also test form validation, disabled writes without wallet, no fake case rows, finalized-success-readback ordering, refresh reconciliation, and mobile landmark/accessibility labels.

- [ ] **Step 3: Run RED**

Run: `npm --prefix app test -- --run src/features`

Expected: UI modules are missing.

- [ ] **Step 4: Implement the minimal complete interface using approved references**

Build a single-page registry with wallet/network header, evidence form, case lookup/resolve action, transaction timeline, and contract readback. Use semantic HTML, keyboard-visible focus, WCAG AA contrast, reduced-motion support, 320 px minimum viewport, and distinct badges for `SUBMITTED`, `VERIFIED`, `REJECTED`, and `UNRESOLVED`. Never fabricate recent cases or success metrics.

- [ ] **Step 5: Run GREEN, responsive browser checks, and commit**

Run: `npm --prefix app test -- --run src/features && npm --prefix app run build && npm --prefix app run lint`

Open local UI at desktop and mobile widths, verify no horizontal overflow and no console errors, then commit:

Run: `git add app && git commit -m "feat: build responsive ReleaseProof workflow"`

---

### Task 6: Real local frontend-to-contract integration and browser flow

**Files:**
- Create: `app/src/contract/localnet.integration.test.ts`
- Create: `tests/integration/releaseproof.spec.ts`
- Create: `tests/integration/fixtures/wallet-provider.ts`
- Modify: `app/vite.config.ts`
- Modify: `app/package.json`

**Interfaces:**
- Consumes: actual contract source, GLSim RPC, Task 4 adapter, Task 5 UI.
- Produces: one real local adapter-to-contract happy path plus browser coverage for wallet/pending/readback and one contract error.

- [ ] **Step 1: Write a failing adapter integration test against GLSim**

Start GLSim with the actual `contracts/releaseproof.py`, deploy it, create a local test account, and invoke the same adapter methods used by React. Assert the exact sequence:

```typescript
const submitted = await submitCase(validPinnedEvidence);
const submittedReceipt = await reconcileTransaction(submitted.hash, submitted.caseId);
expect(submittedReceipt.case.state).toBe("SUBMITTED");

const resolved = await resolveCase(submitted.caseId);
const resolvedReceipt = await reconcileTransaction(resolved.hash, submitted.caseId);
expect(["VERIFIED", "REJECTED", "UNRESOLVED"]).toContain(resolvedReceipt.case.state);
expect(resolvedReceipt.case.binding).toBe(validPinnedEvidence.binding);
```

- [ ] **Step 2: Run RED and verify the real integration harness is absent**

Run: `npm --prefix app run test:integration`

Expected: GLSim lifecycle setup or integration module is missing.

- [ ] **Step 3: Wire GLSim and make the adapter integration GREEN**

Use a test-only generated local account and deterministic web/LLM fixtures. Do not import test fixtures into the production bundle. Wait for finalized receipts and assert contract readback rather than adapter-local state.

Run: `npm --prefix app run test:integration`

Expected: real deploy, submit, resolve, and readback pass.

- [ ] **Step 4: Write and run Playwright browser-state coverage**

Use a test-only EIP-1193 provider fixture and actual local contract address. Cover disconnected state, wallet connect, submission lifecycle, finalized success/readback, refresh reconciliation, and invalid duplicate submission displaying the contract error. Keep the production code path unchanged.

Run: `npm --prefix app run test:e2e`

Expected: all browser tests pass at desktop and mobile projects with no console errors.

- [ ] **Step 5: Commit integration proof**

Run: `git add app tests/integration && git commit -m "test: cover frontend to GenLayer contract flow"`

---

### Task 7: Deployment automation, manifest, security hygiene, and concise README

**Files:**
- Create: `scripts/deploy.ts`
- Create: `scripts/verify-deployment.ts`
- Create: `scripts/write-manifest.ts`
- Create: `deployments/README.md`
- Create: `vercel.json`
- Create: `README.md`
- Create: `docs/evidence-template.md`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: real contract source, `GENLAYER_DEPLOYER_PRIVATE_KEY` at process runtime only, `VERCEL_TOKEN` at action time only.
- Produces after authorized deployment: `deployments/studionet.json` containing network, address, deployment transaction hash, explorer URL, source SHA-256, deployer address, UTC timestamp, policy/schema version, classification, and predecessor/successor fields.

- [ ] **Step 1: Write failing pure tests for manifest construction and secret redaction**

Test that `buildManifest(input)` rejects empty address/hash/source hash, emits `INTENTIONALLY_FROZEN`, and never serializes private key/token fields. Test that deployment logging passes only address/hash/status metadata to the logger.

- [ ] **Step 2: Run RED**

Run: `npm test -- --run scripts`

Expected: deployment/manifest modules do not exist.

- [ ] **Step 3: Implement deployment and readback scripts**

Read contract source, derive SHA-256, create a local account only from `GENLAYER_DEPLOYER_PRIVATE_KEY`, deploy through `genlayer-js` Studionet, wait until finalized, require `FINISHED_WITH_RETURN`, obtain `contractAddress` from the receipt, fetch deployed code/schema, compare source/schema, call `get_case_count`, and only then atomically write the real manifest. Never print or persist the credential.

- [ ] **Step 4: Write concise operations documentation**

README sections are: purpose/non-claim, architecture, repository structure, setup, environment variables, lint/build/tests, local usage, contract deployment, Vercel deployment, frozen recovery, live usage, evidence table, and limitations. `deployments/README.md` explains that no address file exists before a real deployment. `docs/evidence-template.md` uses the required actor → action → contract method → transaction → state → readback columns.

- [ ] **Step 5: Run tests, secret scans, hygiene checks, and commit**

Run:

```powershell
npm test -- --run scripts
rg -n --hidden -g '!node_modules/**' -g '!.git/**' '(BEGIN.*PRIVATE KEY|VERCEL_TOKEN\s*=\s*\S+|PRIVATE_KEY\s*=\s*\S+|0x[a-fA-F0-9]{64})' .
git status --short
git ls-files
```

Expected: script tests pass; secret scan finds no credential values; no build/cache/vendor/internal instruction files are tracked.

Run: `git add scripts deployments vercel.json README.md docs/evidence-template.md package.json .gitignore && git commit -m "chore: add recoverable deployment workflow"`

---

### Task 8: Full verification, review, and mandatory external-action stop

**Files:**
- Modify only files required by verified defects.
- Create after real deployment: `deployments/studionet.json`
- Create after live verification: `docs/evidence.md`

**Interfaces:**
- Consumes: all implementation tasks and live environment identity/configuration.
- Produces: fresh local verification evidence, user-confirmed external actions, live contract/frontend evidence, exact commit and URLs.

- [ ] **Step 1: Run the complete local verification matrix**

Run fresh:

```powershell
gltest tests/direct tests/simulator -q
npm --prefix app run lint
npm --prefix app run build
npm --prefix app test -- --run
npm --prefix app run test:integration
npm --prefix app run test:e2e
```

Record exact test counts, duration, and exit codes. Any defect gets a new failing regression test before its fix.

- [ ] **Step 2: Perform code review and fix Critical/Important findings**

Review contract authorization, immutable bindings, transition guards, semantic validator comparison, evidence failure defaults, frontend receipt ordering, production mock exclusion, secret handling, deployment manifest integrity, and README accuracy. Rerun the full matrix after fixes.

- [ ] **Step 3: Inspect identity context without mutating external systems**

Read and report:

```powershell
git config user.name
git config user.email
gh auth status
git remote -v
genlayer account show
vercel whoami
vercel project ls
```

Also identify the intended GitHub repository owner/name, active GenLayer deployment wallet address, Vercel team/project, exact commit to push, exact contract/network to deploy, and exact Vercel project to deploy.

- [ ] **Step 4: STOP for explicit user confirmation**

State the exact proposed GitHub push, contract deployment, and Vercel deployment with detected identities. Do not perform any of them until the user confirms at this action-time gate.

- [ ] **Step 5: After confirmation, deploy contract and verify source/readback**

Run the deployment script, wait for finalization, verify explorer/source/schema, call `get_case_count`, and commit the real manifest. Push only the confirmed branch/repository and record the exact pushed commit.

- [ ] **Step 6: After confirmation, deploy Vercel and exercise the live app**

Use `VERCEL_TOKEN` from the environment without logging it. Verify desktop/mobile UI, console, wallet/network connection, one successful live case transaction through terminal readback, and one important live error such as duplicate binding or invalid transition. Confirm explorer activity and deployed contract source matches the pushed source hash.

- [ ] **Step 7: Fix and publish the evidence package**

Write `docs/evidence.md` with repository URL, exact commit, source hash, Vercel URL, contract address, deployment transaction, explorer link, lint/build/direct/integration/E2E results, known limitations, and the proof matrix. Rerun secret/hygiene scans, commit the evidence, push only after any required renewed action-time confirmation, and report only claims mapped to live evidence.
