import { useEffect, useMemo, useRef, useState } from "react";

import {
  createReadClient,
  createReleaseProofApi,
  createWalletClient,
  type ReleaseProofApi,
} from "./contract/client";
import {
  configuredChain,
  configuredContractAddress,
  configuredNetworkName,
} from "./contract/config";
import { CaseWorkspace } from "./features/cases/CaseWorkspace";
import {
  connectMetaMask,
  walletErrorMessage,
  type MetaMaskProvider,
} from "./wallet/metamask";

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [walletApi, setWalletApi] = useState<ReleaseProofApi>();
  const [walletProvider, setWalletProvider] = useState<MetaMaskProvider>();
  const [walletError, setWalletError] = useState("");
  const [walletConnecting, setWalletConnecting] = useState(false);
  const mounted = useRef(true);
  const readApi = useMemo(() => {
    try {
      return createReleaseProofApi(createReadClient(), configuredContractAddress());
    } catch {
      return undefined;
    }
  }, []);
  const networkName = configuredNetworkName();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!walletProvider?.on) return;
    const invalidateWallet = () => {
      setWalletAddress("");
      setWalletApi(undefined);
      setWalletProvider(undefined);
      setWalletError("Wallet changed. Reconnect to continue safely.");
    };
    walletProvider.on("accountsChanged", invalidateWallet);
    walletProvider.on("chainChanged", invalidateWallet);
    walletProvider.on("disconnect", invalidateWallet);
    return () => {
      walletProvider.removeListener?.("accountsChanged", invalidateWallet);
      walletProvider.removeListener?.("chainChanged", invalidateWallet);
      walletProvider.removeListener?.("disconnect", invalidateWallet);
    };
  }, [walletProvider]);

  async function connectWallet() {
    if (walletConnecting) return;
    setWalletConnecting(true);
    try {
      setWalletError("");
      setWalletAddress("");
      setWalletApi(undefined);
      setWalletProvider(undefined);
      const connected = await connectMetaMask(window.ethereum, configuredChain());
      if (!mounted.current) return;
      const client = createWalletClient(connected.address, connected.provider);
      const api = createReleaseProofApi(client, configuredContractAddress());
      setWalletProvider(connected.provider);
      setWalletAddress(connected.address);
      setWalletApi(api);
    } catch (error) {
      if (mounted.current) setWalletError(walletErrorMessage(error));
    } finally {
      if (mounted.current) setWalletConnecting(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="ReleaseProof home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>ReleaseProof</span>
        </a>
        <nav>
          <a className="nav-item active" href="#workspace"><span aria-hidden="true">⌁</span>Registry</a>
          <a className="nav-item" href="#policy"><span aria-hidden="true">◇</span>Policy</a>
        </nav>
        <div className="sidebar-note">
          <span className="network-dot" />
          <div><strong>{networkName === "studionet" ? "Studionet" : "Localnet"}</strong><small>Intentionally frozen</small></div>
        </div>
      </aside>

      <div className="main-column" id="top">
        <header className="topbar">
          <div className="breadcrumb"><span>Registry</span><b>/</b><strong>Evidence workspace</strong></div>
          <button
            className={walletAddress ? "wallet-button connected" : "wallet-button"}
            disabled={walletConnecting}
            onClick={connectWallet}
            type="button"
          >
            <span className="wallet-indicator" />
            {walletAddress ? shortAddress(walletAddress) : "Connect MetaMask"}
          </button>
        </header>
        {walletError && <div className="global-error" role="alert">{walletError}</div>}
        <main id="workspace">
          <CaseWorkspace
            initialPhase={walletAddress ? "idle" : "disconnected"}
            readApi={readApi}
            walletConnected={Boolean(walletAddress && walletApi)}
            writeApi={walletApi}
          />
          <section className="policy-section" id="policy" aria-labelledby="policy-title">
            <div><p className="eyebrow">Reproducibility Policy v1</p><h2 id="policy-title">What validators establish</h2></div>
            <ol>
              <li><span>01</span><div><strong>Question</strong><p>A clear research question or hypothesis.</p></div></li>
              <li><span>02</span><div><strong>Procedure</strong><p>Concrete steps with dependencies or environment.</p></div></li>
              <li><span>03</span><div><strong>Results</strong><p>Outputs connected to the stated procedure.</p></div></li>
              <li><span>04</span><div><strong>Limitations</strong><p>Constraints, failure conditions, or known limits.</p></div></li>
            </ol>
          </section>
        </main>
        <footer><span>Source of truth: GenLayer Intelligent Contract</span><span>releaseproof-case-v1</span></footer>
      </div>
    </div>
  );
}
