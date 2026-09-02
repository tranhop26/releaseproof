# ReleaseProof

ReleaseProof is a GenLayer MVP that records whether an immutable, GitHub-pinned
research artifact satisfies Reproducibility Policy v1. It does not prove that a
scientific claim is true; it establishes whether the submitted artifact contains
a question, procedure, results, and limitations that validators can inspect.

The current public production deployment is the historical v1 contract and
frontend recorded in `deployments/studionet.json` and `docs/evidence.md`. This
repository source targets the pending verified successor
`releaseproof-case-v2`, which must not be treated as live until a new
Studionet deployment, source/schema verification, and Vercel cutover are
completed and recorded.

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
- `scripts/`, `deployments/`: production v1 manifest plus successor deployment and verification tooling.

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
$env:GENLAYER_PYTHON=(Resolve-Path '.venv\Scripts\python.exe').Path
npm --prefix app test -- --run
npm --prefix app run test:integration
npm --prefix app run test:e2e
npm --prefix app run lint
npm --prefix app run build
npm run test:scripts
npm run check:scripts
npm --prefix app run dev
```

## Deploy and use

Deployment is an explicit, confirmed operation:

```powershell
npm run deploy:studionet
vercel --prod
```

The contract script waits for finalization, verifies deployed source/schema and
`get_case_count`, then writes the successor manifest and predecessor link during
the confirmed deployment cutover. Set the verified successor address as
`VITE_GENLAYER_CONTRACT_ADDRESS` before building the frontend. In the app, use
unlocked desktop MetaMask with Snaps enabled. Click `Connect MetaMask`;
ReleaseProof selects MetaMask even when another injected wallet is installed,
switches to the configured GenLayer network, checks `wallet_getSnaps`, and
requests the published `npm:genlayer-wallet-plugin` Snap only when it is absent
or disabled. Approve the account, network, and Snap prompts before submitting
`owner/repository`, a 40-character commit, a Markdown path, and the raw file
SHA-256; then resolve or read the case by ID.

Current production remains the historical v1 deployment at
[`0x946BC9B19BD971CBefb56845b5825FB7B9f6b183`](https://explorer-studio.genlayer.com/address/0x946BC9B19BD971CBefb56845b5825FB7B9f6b183),
created by [transaction `0x5e449a…5a17f8`](https://explorer-studio.genlayer.com/tx/0x5e449a2d3ae62c7b6f0df9aa884014c5a5fcf48e94d8f6745a29f2f9495a17f8),
with fixed production evidence in `docs/evidence.md`. A v2 successor becomes
public only after a separate verified deployment updates the manifest and live
evidence.

Current limitations: public GitHub Markdown only, fixed canonical
`raw.githubusercontent.com` fetches only, 32 KiB maximum, one frozen policy, no
custody or payments, and no appeal/edit path for terminal decisions.
