# ReleaseProof v2 reproducibility fixture

## Question

Can the ReleaseProof v2 implementation preserve one immutable evidence binding,
produce deterministic terminal decisions, and reject a duplicate binding without
changing the original case?

## Procedure

The test environment used Python 3.14 with `genlayer-test[sim]` 0.29.2 and Node.js
with the locked npm dependencies. From the repository root, the contract suite was
run with `.venv\Scripts\python.exe -m pytest`. From `app`, the frontend suite was
run with `npm test -- --run`, followed by `npm run test:integration`, `npm run
lint`, `npm run build`, and `npm run test:e2e`. From the repository root,
`npm run test:scripts` and `npm run check:scripts` verified the deployment tools.

## Results

The contract suite passed 45 tests. The frontend suite passed 52 tests, the
frontend-to-contract integration passed 1 test, and the browser suite passed its
2 assigned checks with 2 intentional device-matrix skips. The deployment scripts
passed 27 tests. TypeScript checks, ESLint, and the production build completed
successfully. Direct duplicate-binding tests confirmed that the second submission
raises an execution error while the original binding and case count remain
unchanged.

## Limitations

These results cover the pinned repository revision and its specified dependency
versions; they do not prove scientific truth or behavior on another revision.
Studionet validator availability and nondeterministic web access remain external
conditions. Live MetaMask and GenLayer Snap transactions must still be verified
separately from the automated test matrix.
