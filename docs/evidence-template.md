# Live evidence

Replace every `_BLANK - ..._` marker before publishing final evidence. Final
evidence must not contain any blank proof field.

- Application source commit: `_BLANK - exact commit after deployment and frontend cutover_`
- Contract source SHA-256: `_BLANK - exact SHA-256 of the deployed local contract source_`
- Current production Vercel URL: `_BLANK - exact URL of the live deployment under review_`
- Current Vercel deployment ID/status: `_BLANK - exact deployment identifier and readiness state_`
- Successor contract address: `_BLANK - exact v2 Studionet address after verified deployment_`
- Fresh contract test count: `_BLANK - exact passing direct + simulator contract test count from the latest verification run_`
- Fresh frontend test count: `_BLANK - exact passing frontend unit/integration test count from the latest verification run_`
- Fresh adapter test count: `_BLANK - exact passing contract-adapter test count from the latest verification run_`
- Fresh E2E test count: `_BLANK - exact passing end-to-end test count from the latest verification run_`
- Fresh script test count: `_BLANK - exact passing script test count from the latest verification run_`
- Latest lint result: `_BLANK - exact command result from the latest verification run_`
- Latest build result: `_BLANK - exact command result from the latest verification run_`
- Known limitations: `_BLANK - every remaining material limitation, including any unverified deployedAt receipt-timestamp caveat_`

| Actor | Action | Contract method | Transaction | State | Authoritative readback |
|---|---|---|---|---|---|
| Operator | Current Vercel production deployment | `n/a` | `_BLANK - Vercel deployment ID or deployment URL_` | `_BLANK - READY or equivalent live status_` | `_BLANK - public URL serves the reviewed build_` |
| Wallet user | Live MetaMask and GenLayer Snap preparation | `n/a` | `_BLANK - browser proof or recorded session artifact_` | `_BLANK - wallet connected on target network with Snap enabled_` | `_BLANK - app shows ready account/network state before writes_` |
| Deployer | Deploy verified v2 successor | constructor | `_BLANK - finalized Studionet deployment transaction_` | `FINALIZED` | `_BLANK - address, explorer link, and manifest entry_` |
| Verifier | Prove deployed source/schema equality | `get_case_count` | `_BLANK - deployment verification run or linked transaction context_` | `_BLANK - verified_` | `_BLANK - deployed source == local source; deployed schema == local schema; initial get_case_count = 0_` |
| Researcher | Submit pinned evidence | `submit_case` | `_BLANK - finalized submit transaction_` | `SUBMITTED` | `_BLANK - get_case(case_id) shows v2 binding and canonical URL_` |
| Resolver | Accepted semantic resolution | `resolve_case` | `_BLANK - finalized successful resolution transaction_` | `VERIFIED` or `REJECTED` | `_BLANK - get_case(case_id) shows terminal state, deterministic reason, resolver, observed_at, and resolved_at_` |
| Resolver | Terminal stale or unsupported branch | `resolve_case` | `_BLANK - finalized terminal UNRESOLVED transaction_` | `UNRESOLVED` | `_BLANK - get_case(case_id) shows deterministic unresolved reason and preserved binding_` |
| Resolver | Replay a terminal resolution attempt | `resolve_case` | `_BLANK - replay transaction hash or equivalent execution record_` | execution error; prior terminal state unchanged | `_BLANK - full prior get_case(case_id) terminal readback remains unchanged after the revert_` |
| Researcher | Duplicate binding replay rejection | `submit_case` | `_BLANK - replay transaction hash or equivalent execution record_` | execution error; prior state unchanged | `_BLANK - duplicate binding rejected and get_case_count unchanged_` |
| Any third party | Resolve someone else's submitted case | `resolve_case` | `_BLANK - finalized third-party resolver transaction_` | `VERIFIED`, `REJECTED`, or `UNRESOLVED` | `_BLANK - get_case(case_id).resolver differs from submitter_` |
