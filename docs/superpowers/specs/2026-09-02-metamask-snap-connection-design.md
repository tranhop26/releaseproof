# MetaMask and GenLayer Snap Connection Design

## Context

ReleaseProof currently requests an account from `window.ethereum`, creates a
GenLayer client, and then calls `client.connect("studionet")`. In
`genlayer-js@1.1.8`, `connect` reads `window.ethereum` again and performs
MetaMask-specific network and Snap requests. When several wallet extensions are
installed, the two steps can address different providers. Provider rejections
that are plain EIP-1193 objects also collapse to the unhelpful message
`Wallet connection failed`.

The deployed contract, Studionet address, read client, transaction lifecycle,
and authoritative contract readback are outside this defect and will not
change.

## Scope and success criteria

ReleaseProof will explicitly support desktop MetaMask with the published
GenLayer Snap. A connection is successful only after all of these steps finish:

1. A MetaMask provider is selected.
2. MetaMask returns a valid account.
3. MetaMask is on the configured GenLayer network.
4. The GenLayer Snap is installed or approved.
5. The write client is created with that same provider and account.

The UI must remain disconnected after any failure and must display an
actionable, stage-appropriate error. Read-only contract access remains
available without a wallet.

Supporting OKX Wallet, Rabby, WalletConnect, mobile wallet browsers, or a
generic multi-wallet chooser is explicitly out of scope.

## Considered approaches

### Error text only

Normalize thrown values but retain `client.connect`. This improves diagnostics
but does not prevent the SDK from reading a different global provider. It does
not resolve the root cause.

### Explicit MetaMask preparation in ReleaseProof — selected

Select one MetaMask provider, perform network and Snap preparation against that
exact provider, and then pass it to the GenLayer write client. This removes the
global-provider ambiguity, handles an already-added Studionet correctly, adds
no dependency, and keeps the change local to wallet integration.

### MetaMask SDK or a wallet framework

Add MetaMask SDK, wagmi, or another connector framework. This is appropriate
for a future multi-wallet product but introduces unnecessary dependencies and
migration risk for the current MetaMask-only submission.

## Architecture

Create `app/src/wallet/metamask.ts` as the single boundary for injected-wallet
behavior. It will expose:

- `selectMetaMaskProvider(injected)` to select `isMetaMask === true`, including
  the common `injected.providers` multi-provider array;
- `connectMetaMask(injected, chain)` to request an account, switch or add the
  configured network, and install the GenLayer Snap;
- `walletErrorMessage(error)` to map EIP-1193 codes and structured error values
  to safe, actionable UI text.

`App.tsx` will call this boundary and will no longer call the SDK's
`client.connect`. It will create the write client only after preparation
succeeds. Account, chain, and disconnect listeners will attach to the selected
MetaMask provider rather than the global provider. The button copy will become
`Connect MetaMask` so reviewers know the supported wallet before interacting.

The configured chain remains sourced from `configuredChain()`. Studionet uses
chain ID `61999`, its configured RPC URL, native currency, and explorer URL.
Network preparation first calls `wallet_switchEthereumChain`; it calls
`wallet_addEthereumChain` only after the provider reports unknown chain code
`4902`, then retries the switch.

The required Snap ID remains `npm:genlayer-wallet-plugin`. The connector calls
`wallet_getSnaps` and requests the Snap only when it is absent.

## Error behavior

The connector will distinguish at least these cases:

- MetaMask is missing or a different injected wallet owns the provider;
- the user rejects account, network, or Snap approval (`4001`);
- another MetaMask request is already open (`-32002`);
- the provider does not support the requested method (`4200` or `-32601`);
- Studionet cannot be added or selected;
- the GenLayer Snap cannot be inspected or installed;
- no valid account is returned.

Unknown structured errors retain their non-empty `message`; only values with no
usable details use a final generic fallback. No wallet address or write client
is stored on failure.

## Test strategy

Test-first regression coverage will verify:

- selecting MetaMask from multiple injected providers;
- rejecting a non-MetaMask provider;
- switching an existing Studionet without trying to add it;
- adding Studionet only after unknown-chain code `4902`;
- retaining an installed GenLayer Snap;
- requesting a missing GenLayer Snap;
- mapping rejected, pending, unsupported-method, structured, and unknown errors;
- keeping the UI disconnected on failure;
- exposing the wallet only after network and Snap preparation completes;
- invalidating the wallet through events from the selected provider.

After unit tests pass, run the complete frontend test suite, lint, TypeScript
build, and a production build. Browser verification must exercise the deployed
or local production build with desktop MetaMask, approve the Snap when needed,
confirm the connected address, submit a transaction, wait for `FINALIZED` and
execution success, and confirm authoritative readback. GitHub push and Vercel
deployment require separate action-time confirmation of the active accounts.

## GenLayer trust and state impact

This change does not alter the trust matrix, validator decision, evidence
binding, replay domain, contract state machine, or `INTENTIONALLY_FROZEN`
classification. The Intelligent Contract remains the source of truth. The
frontend still advances no case state until finalized successful execution and
readback; the change only makes the wallet boundary deterministic and
diagnosable.
