import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, NavLink, useLocation, Link } from "react-router-dom";
import { wagmiConfig } from "../lib/wagmi";
import { queryClient } from "../lib/query";
import { ConnectButton } from "./ConnectButton";
import { NetworkStatus } from "./NetworkStatus";
import { CopyableAddress } from "./CopyableAddress";
import { MultisigProvider, useMultisig } from "../context/MultisigContext";
import HomePage from "../pages/HomePage";
import PoliciesPage from "../pages/PoliciesPage";
import AuditLogPage from "../pages/AuditLogPage";
import GovernancePage from "../pages/GovernancePage";
import PolicyDetailPage from "../pages/PolicyDetailPage";
import OnboardingPage from "../pages/OnboardingPage";
import TestTransactionsPage from "../pages/TestTransactionsPage";
import PendingTransactionsPage from "../pages/PendingTransactionsPage";

const NAV_LINKS = [
  { to: "/pending", label: "Pending", end: true },
  { to: "/policies", label: "Policies", end: true },
  { to: "/transact", label: "Transact", end: true },
  { to: "/audit", label: "Audit Log", end: false },
  { to: "/governance", label: "Governance", end: false },
];

function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const { selectedMultisig, hasSelection, clearSelection } = useMultisig();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-bold text-[var(--accent)] hover:opacity-80">
              Multisig Policy Engine
            </Link>
            <nav className="flex gap-1">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-[var(--accent)] text-black"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ConnectButton />
            {hasSelection && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-card)] rounded-md">
                <span className="text-xs text-[var(--text-secondary)]">Selected:</span>
                <CopyableAddress address={selectedMultisig?.wallet || ""} short={true} />
                <button
                  onClick={clearSelection}
                  className="text-xs text-[var(--red)] hover:underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-[var(--border)] py-3 text-center text-xs text-[var(--text-secondary)]">
        Multisig Policy Engine v0.1.0
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MultisigProvider>
          <BrowserRouter>
            <Shell>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/pending" element={<PendingTransactionsPage />} />
                <Route path="/policies" element={<PoliciesPage />} />
                <Route path="/policy/:id" element={<PolicyDetailPage />} />
                <Route path="/transact" element={<TestTransactionsPage />} />
                <Route path="/audit" element={<AuditLogPage />} />
                <Route path="/governance" element={<GovernancePage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
              </Routes>
            </Shell>
          </BrowserRouter>
        </MultisigProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
