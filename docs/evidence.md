# Live evidence

- Repository: <https://github.com/tranhop26/releaseproof>
- Application source commit: `0f066c2eb677b585abd1dff0331b744d2e6ddd0e`
- Production: <https://releaseproof-khaki.vercel.app>
- Vercel deployment: `dpl_3iGrQMdg1Hh3rMRcPUbstqWqMFRG` (`READY`)
- Contract: [`0x946BC9B19BD971CBefb56845b5825FB7B9f6b183`](https://explorer-studio.genlayer.com/address/0x946BC9B19BD971CBefb56845b5825FB7B9f6b183)
- Deployment transaction: [`0x5e449a2d3ae62c7b6f0df9aa884014c5a5fcf48e94d8f6745a29f2f9495a17f8`](https://explorer-studio.genlayer.com/tx/0x5e449a2d3ae62c7b6f0df9aa884014c5a5fcf48e94d8f6745a29f2f9495a17f8)
- Exact deployed-source SHA-256: `1dfb74d2fb03be493abb6a259fcea65de99441b40b26acb7dd7134da17a757ab`
- Normalized deployed-source SHA-256: `2236ad7c72747930ffd283ca3e07b5adc2495b12b71dbd90efdfb0be6f6b7981`

The contract source/schema matched the repository source after CRLF/LF
normalization. Deployment and all transactions below reached `FINALIZED` on
Studionet. Reads use finalized contract state.

| Actor | Action | Contract method | Transaction | State | Authoritative readback |
|---|---|---|---|---|---|
| Deployer (`0x21b4…2eC7`) | Deploy frozen successor | constructor | [`0x5e449a…5a17f8`](https://explorer-studio.genlayer.com/tx/0x5e449a2d3ae62c7b6f0df9aa884014c5a5fcf48e94d8f6745a29f2f9495a17f8) | `FINALIZED` | `MAJORITY_AGREE`; source/schema match; initial `get_case_count = 0` |
| Researcher (`0x21b4…2eC7`) | Submit pinned README | `submit_case` | [`0x33a8de…abca30`](https://explorer-studio.genlayer.com/tx/0x33a8de69a0e5f2386c2db8c1f690e78a721a3076475d4a00a8747cd2f9abca30) | `SUBMITTED` | `MAJORITY_AGREE`; binding case ID 1; canonical URL and hash match |
| Resolver (`0x21b4…2eC7`) | First resolution attempt | `resolve_case` | [`0x5b21a7…686dde`](https://explorer-studio.genlayer.com/tx/0x5b21a78eb67ca2de54d56895f292c64640febeaca9b21447465b070490686dde) | unchanged `SUBMITTED` | `MAJORITY_DISAGREE`; count, binding, and case state conserved |
| Resolver (`0x21b4…2eC7`) | Retry resolution | `resolve_case` | [`0x78aaa6…61f4b9`](https://explorer-studio.genlayer.com/tx/0x78aaa6b04b138010d60ec92413f51c1916010d7c273011200ea179f4ed61f4b9) | `REJECTED` | `MAJORITY_AGREE`; procedure/limitations true, question/results false |
| Researcher (`0x21b4…2eC7`) | Replay identical binding | `submit_case` | [`0xb2ec48…861291`](https://explorer-studio.genlayer.com/tx/0xb2ec487df64b62a3187f4d1505d517e660ecbaa82372b8caafb20f581c861291) | execution error | `contract_error`; count remains 1 and case 1 remains `REJECTED` |

## Verification results

- Direct and simulator contract tests: `23 passed`.
- Frontend unit tests: `25 passed`.
- Frontend-to-GLSim integration: `1 passed`.
- Browser E2E: `2 passed`, `2 skipped` intentionally so the transaction flow
  runs once on desktop and responsive overflow runs once on mobile.
- Deployment-script tests: `12 passed`.
- TypeScript checks, ESLint, and production Vite build: passed.
- Live desktop and 390 px mobile layouts: no horizontal overflow and no console errors; disconnected,
  wallet-ready, pending, synchronized readback, terminal decision, and execution
  error states were exercised.

## Remaining limits

- Public GitHub Markdown only; maximum artifact size is 32 KiB.
- One frozen policy version; terminal decisions have no edit or appeal path.
- `INTENTIONALLY_FROZEN`: recovery requires a verified successor deployment and
  manifest/frontend cutover while preserving this contract as read-only history.
- No funds, stake, escrow, custody, refund, or claim logic exists in this MVP.
- Studionet receipts expose replay as leader `ERROR` / `contract_error` but do
  not include the Python exception text; the direct duplicate-guard test plus
  finalized receipt and unchanged finalized state provide the evidence.
- Three unused frozen Studio deployment attempts were created while isolating
  the editor persistence issue (`0x7E34…50d2`, `0x467b…c7a6`, `0x2544…8171`).
  They are not ReleaseProof production, are absent from the manifest/frontend,
  and contain no application cases or funds.
