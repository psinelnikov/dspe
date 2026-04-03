import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { wagmiConfig } from "../lib/wagmi";
import { queryClient } from "../lib/query";
import { ConnectButton } from "./ConnectButton";
import PoliciesPage from "../pages/PoliciesPage";
import AuditLogPage from "../pages/AuditLogPage";
import GovernancePage from "../pages/GovernancePage";
import PolicyDetailPage from "../pages/PolicyDetailPage";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-[var(--accent)]">
              Multisig Policy Engine
            </h1>
            <nav className="flex gap-1">
              {[
                { to: "/", label: "Policies" },
                { to: "/audit", label: "Audit Log" },
                { to: "/governance", label: "Governance" },
              ].map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === "/"}
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
          <ConnectButton />
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-[var(--border)] py-3 text-center text-xs text-[var(--text-secondary)]">
        Flare Coston2 &middot; Multisig Policy Engine v0.1.0
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Shell>
            <Routes>
              <Route path="/" element={<PoliciesPage />} />
              <Route path="/policy/:id" element={<PolicyDetailPage />} />
              <Route path="/audit" element={<AuditLogPage />} />
              <Route path="/governance" element={<GovernancePage />} />
            </Routes>
          </Shell>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
