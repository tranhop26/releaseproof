# ReleaseProof v2 live evidence

## Fixed deployment identity

- Repository: <https://github.com/tranhop26/releaseproof>
- Application source commit: [`64261a2f6323742e3e86afd510c1ef275405da14`](https://github.com/tranhop26/releaseproof/commit/64261a2f6323742e3e86afd510c1ef275405da14)
- Production application: <https://releaseproof-khaki.vercel.app>
- Vercel production deployment reference: `7PCca9jeEa6pBb2LVUJVyjQYFZqm` (`READY`)
- Studionet contract: [`0x8802668Ce23EbCF6ef6b02df50a0a434Fd986514`](https://explorer-studio.genlayer.com/address/0x8802668Ce23EbCF6ef6b02df50a0a434Fd986514)
- Deployment transaction: [`0xf200ac8b1db440662ad042baf47a5c9786693b33a430dc928472986c2d22419c`](https://explorer-studio.genlayer.com/tx/0xf200ac8b1db440662ad042baf47a5c9786693b33a430dc928472986c2d22419c)
- Exact deployed-source SHA-256: `93265c2cac5bf52c216c9f7fb5cc0fa9450207d0af2e055d532bf8045b932f47`
- Normalized repository-source SHA-256: `8389b55cb019578491187bab2ceb6bd6737a0b5085817d94354730203a6a2cb5`
- Contract classification: `INTENTIONALLY_FROZEN`
- Schema/policy replay domain: `releaseproof-case-v2` / `reproducibility-v1`

The deployment finalized with five validators and accepted consensus. The
deployed source and schema matched the repository contract after the documented
normalization, and initial `get_case_count()` returned `0`. The production
bundle contains the v2 address and does not contain the predecessor v1 address.

## Immutable live fixture

- Source: <https://raw.githubusercontent.com/tranhop26/releaseproof/64261a2f6323742e3e86afd510c1ef275405da14/docs/live-proof-fixture.md>
- Size: `1620` bytes
- SHA-256: `af23daaafc0f74ef09add4f0140705a7c652a0e211a69f8c2bf05ca98554585d`
- Required sections: Question, Procedure, Results, and Limitations

Canonical valid binding:

```text
releaseproof-case-v2|reproducibility-v1|submit_case|tranhop26/releaseproof|64261a2f6323742e3e86afd510c1ef275405da14|docs/live-proof-fixture.md|af23daaafc0f74ef09add4f0140705a7c652a0e211a69f8c2bf05ca98554585d
```

## Live proof matrix

| Actor | Action | Contract method | Transaction hash | `FINALIZED` / execution | Authoritative readback | Source/test |
|---|---|---|---|---|---|---|
| Deployer (`0x21b45103dd05c43969daF3CbB4277391777e2eC7`) | Deploy frozen v2 contract | constructor | [`0xf200ac…419c`](https://explorer-studio.genlayer.com/tx/0xf200ac8b1db440662ad042baf47a5c9786693b33a430dc928472986c2d22419c) | `FINALIZED`; success; accepted consensus | Source/schema equality; initial count `0` | `contracts/releaseproof.py`; `scripts/verify-deployment.ts` |
| Researcher (`0x21b45103dd05c43969daF3CbB4277391777e2eC7`) | Submit exact immutable fixture | `submit_case` | [`0x9a7e21…6749`](https://explorer-studio.genlayer.com/tx/0x9a7e21fa5b73637813200394c57ca1cc8bfe5f5f5bc9fdccb7d3d2b45cb36749) | `FINALIZED`; execution success | Case `1`, `SUBMITTED`; canonical URL, binding, hash, and submitter match | `docs/live-proof-fixture.md`; submission tests |
| Third-party resolver (`0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2`) | Resolve another wallet's case | `resolve_case(1)` | [`0xc13111…2430`](https://explorer-studio.genlayer.com/tx/0xc131119964252653d325d2cc75e7521750873f1100eded3c1c8bff8caa592430) | `FINALIZED`; execution success | Case `1`, `VERIFIED`; all four criteria true; resolver differs from submitter | Fixture; resolution and third-party-trigger tests |
| Researcher (`0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2`) | Submit the same pinned source with a deliberately false all-zero hash | `submit_case` | [`0x8782be…23de`](https://explorer-studio.genlayer.com/tx/0x8782be4396d46047d562d40762370fc10435617ae5e17f078dd5a4559b9c23de) | `FINALIZED`; execution success | Case `2`, `SUBMITTED`; stored hash is 64 zeroes | Hash-mismatch tests |
| Resolver (`0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2`) | Resolve mismatched evidence | `resolve_case(2)` | [`0x79af88…7929`](https://explorer-studio.genlayer.com/tx/0x79af88fb823a9575eb281b21d126a6330d53127b6c179ab92dab48b21e1f7929) | `FINALIZED`; execution success | Case `2`, `UNRESOLVED`; reason `Pinned evidence hash does not match` | Hash-mismatch and safe-unresolved tests |
| Researcher (`0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2`) | Replay the exact valid case-1 binding | `submit_case` | [`0x3e5273…2ade`](https://explorer-studio.genlayer.com/tx/0x3e52734f39bf3d47261fa3bbddd368b7481e0ec12699f30482e12313c0882ade) | `FINALIZED`; execution error | Direct post-transaction `get_case_count()` is `2`; no case `3` was created | Duplicate-binding regression tests |

Case 1 timestamps were submitted at `2026-09-02T08:51:40.289855Z` and
resolved at `2026-09-02T09:04:37.405125Z`. Case 2 was submitted at
`2026-09-02T09:06:49.586765Z` and resolved at
`2026-09-02T09:08:06.669425Z`.

## Verification results

- Contract suite: `45/45` passed.
- Frontend suite: `52/52` passed.
- Frontend-to-GLSim integration: `1` passed.
- Browser E2E: `2` passed and `2` intentionally skipped so each promoted flow
  runs once at its intended viewport.
- Deployment and repository scripts: `27/27` passed.
- TypeScript checks, ESLint, and the production Vite build passed.
- Production desktop and 390 px mobile checks showed no horizontal overflow.
- Production console inspection showed no application errors.
- Live wallet checks covered disconnected, connected, pending, timeout/resume,
  finalized success, terminal readback, safe unresolved, and execution-error
  states.

## Known limitations

- Evidence is limited to public GitHub Markdown at an immutable commit; the
  maximum artifact size is 32 KiB.
- The v1 reproducibility policy is frozen. Terminal decisions have no edit,
  appeal, owner override, or privileged upgrade path.
- Recovery requires deploying and verifying a successor, linking manifests,
  and explicitly cutting the frontend over while keeping this contract as
  read-only history.
- This MVP has no funds, stake, escrow, custody, payout, refund, or claim logic.
- Studionet is a simulated environment and must not be represented as real-money
  production settlement.
- The frontend's transaction wait can time out while Studionet status is still
  progressing. `Resume transaction` continues polling the same hash and never
  automatically creates a replacement transaction.
- The finalized duplicate receipt exposes an execution error without the Python
  exception text. The duplicate regression test, finalized receipt, missing
  case `3`, and direct count readback of `2` jointly establish replay rejection.

## Predecessor history

The previous frozen v1 contract remains available as read-only history at
[`0x946BC9B19BD971CBefb56845b5825FB7B9f6b183`](https://explorer-studio.genlayer.com/address/0x946BC9B19BD971CBefb56845b5825FB7B9f6b183).
The current production manifest links it as the predecessor, and the historical
v1 manifest links v2 as its successor.
