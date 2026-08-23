# ReleaseProof

ReleaseProof is a GenLayer MVP that records whether an immutable, GitHub-pinned
research artifact satisfies Reproducibility Policy v1. It does not prove that a
scientific claim is true; it establishes whether the submitted artifact contains
a question, procedure, results, and limitations that validators can inspect.

## Trust model and lifecycle

Researchers and reviewers may not trust each other to preserve or assess evidence.
The Intelligent Contract is the source of truth: it validates the immutable
binding, prevents replay, asks GenLayer validators to inspect the exact artifact,
and stores `VERIFIED`, `REJECTED`, or safe `UNRESOLVED` terminal readback.

`SUBMITTED → VERIFIED | REJECTED | UNRESOLVED`. Fetch, hash, identity, malformed
response, expiry, or safe-decision failures become `UNRESOLVED`; failed consensus
does not mutate `SUBMITTED`. The contract is `INTENTIONALLY_FROZEN`: it has no
owner, upgrade, edit, or delete method. Recovery deploys a verified successor and
preserves the predecessor read-only, as described in `docs/recovery.md`.

## Architecture

- `contracts/`: Python Intelligent Contract and all decision/state logic.
- `app/`: React/Vite UI using `genlayer-js` directly; no outcome backend or mock data.
- `tests/direct`, `tests/simulator`: deterministic branches and consensus safety.
- `app/tests/integration`: wallet-to-frontend-to-real-GLSim browser flow.
- `scripts/`, `deployments/`: verified Studionet deployment and manifest generation.

## Setup and environment

Requires Python 3.14, Node.js, npm, and GenLayer tooling.

```powershell
python -m venv .venv
.venv\Scripts\pip install -e ".[dev]"
npm install
npm --prefix app ci
Copy-Item .env.example .env
```

Configure `.env` locally; never commit it:

- `GENLAYER_DEPLOYER_PRIVATE_KEY`: deployment key, used only by the deploy process.
- `VITE_GENLAYER_CONTRACT_ADDRESS`: deployed contract address.
- `VITE_GENLAYER_NETWORK`: `studionet` or `localnet`.
- `VITE_GENLAYER_RPC_URL`: optional explicit RPC URL, used by local integration.
- `VERCEL_TOKEN`: Vercel CLI credential, used only at deployment time.

## Run and verify

```powershell
.venv\Scripts\gltest.exe tests/direct tests/simulator -q
npm --prefix app test -- --run
npm --prefix app run test:integration
npm --prefix app run test:e2e
npm --prefix app run lint
npm --prefix app run build
npm run test:scripts
npm --prefix app run dev
```

## Deploy and use

Deployment is an explicit, confirmed operation:

```powershell
npm run deploy:studionet
vercel --prod
```

The contract script waits for finalization, verifies deployed source/schema and
`get_case_count`, then writes `deployments/studionet.json`. Set the manifest address
as `VITE_GENLAYER_CONTRACT_ADDRESS` before building the frontend. In the app,
connect an injected wallet, submit `owner/repository`, a 40-character commit, a
Markdown path, and the raw file SHA-256; then resolve or read the case by ID.

Studionet deployment: [`0x946BC9B19BD971CBefb56845b5825FB7B9f6b183`](https://explorer-studio.genlayer.com/address/0x946BC9B19BD971CBefb56845b5825FB7B9f6b183),
created by [transaction `0x5e449a…5a17f8`](https://explorer-studio.genlayer.com/tx/0x5e449a2d3ae62c7b6f0df9aa884014c5a5fcf48e94d8f6745a29f2f9495a17f8).
The finalized deployment metadata and on-chain source hash are recorded in
`deployments/studionet.json`. The frozen predecessor remains linked in
`deployments/studionet-predecessor.json` as read-only history.

The live actor/action/transaction/readback table is recorded in `docs/evidence.md`
after the production exercise. Current limitations: public
GitHub Markdown only, 32 KiB maximum, one frozen policy, no custody or payments,
and no appeal/edit path for terminal decisions.
