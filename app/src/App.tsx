import { useMemo, useState } from "react";

import {
  createReadClient,
  createReleaseProofApi,
  createWalletClient,
  type ReleaseProofApi,
  type WalletProvider,
} from "./contract/client";
import { configuredContractAddress, configuredNetworkName } from "./contract/config";
import { CaseWorkspace } from "./features/cases/CaseWorkspace";


declare global {
  interface Window {
    ethereum?: WalletProvider;
  }
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [walletApi, setWalletApi] = useState<ReleaseProofApi>();
  const [walletError, setWalletError] = useState("");
  const readApi = useMemo(() => {
    try {
      return createReleaseProofApi(createReadClient(), configuredContractAddress());
    } catch {
      return undefined;
    }
  }, []);

  async function connectWallet() {
    if (!window.ethereum) {
      setWalletError("No injected wallet was found.");
      return;
    }
    try {
      setWalletError("");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
        throw new Error("Wallet did not return an account");
      }
      const client = createWalletClient(accounts[0], window.ethereum);
      await client.connect(configuredNetworkName());
      setWalletAddress(accounts[0]);
      setWalletApi(createReleaseProofApi(client, configuredContractAddress()));
    } catch (caught) {
      setWalletError(caught instanceof Error ? caught.message : "Wallet connection failed");
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
          <div><strong>Studionet</strong><small>Intentionally frozen</small></div>
        </div>
      </aside>

      <div className="main-column" id="top">
        <header className="topbar">
          <div className="breadcrumb"><span>Registry</span><b>/</b><strong>Evidence workspace</strong></div>
          <button className={walletAddress ? "wallet-button connected" : "wallet-button"} onClick={connectWallet} type="button">
            <span className="wallet-indicator" />
            {walletAddress ? shortAddress(walletAddress) : "Connect wallet"}
          </button>
        </header>
        {walletError && <div className="global-error" role="alert">{walletError}</div>}
        <main id="workspace">
          <CaseWorkspace
            initialPhase={walletAddress ? "idle" : "disconnected"}
            contractApi={walletApi ?? readApi}
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
