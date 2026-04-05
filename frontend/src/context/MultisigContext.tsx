import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export interface MultisigDeployment {
  wallet: `0x${string}`;
  governance: `0x${string}`;
  policyRegistry: `0x${string}`;
  auditLog: `0x${string}`;
}

interface MultisigContextType {
  selectedMultisig: MultisigDeployment | null;
  setSelectedMultisig: (multisig: MultisigDeployment | null) => void;
  selectMultisig: (multisig: MultisigDeployment) => void;
  clearSelection: () => void;
  hasSelection: boolean;
}

const STORAGE_KEY = "selectedMultisig";

const MultisigContext = createContext<MultisigContextType | null>(null);

export function MultisigProvider({ children }: { children: ReactNode }) {
  const [selectedMultisig, setSelectedMultisigState] = useState<MultisigDeployment | null>(() => {
    // Load from localStorage on init
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored) as MultisigDeployment;
        } catch {
          return null;
        }
      }
    }
    return null;
  });

  const setSelectedMultisig = useCallback((multisig: MultisigDeployment | null) => {
    setSelectedMultisigState(multisig);
    if (multisig && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(multisig));
    } else if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const selectMultisig = useCallback((multisig: MultisigDeployment) => {
    setSelectedMultisig(multisig);
  }, [setSelectedMultisig]);

  const clearSelection = useCallback(() => {
    setSelectedMultisig(null);
  }, [setSelectedMultisig]);

  return (
    <MultisigContext.Provider
      value={{
        selectedMultisig,
        setSelectedMultisig,
        selectMultisig,
        clearSelection,
        hasSelection: selectedMultisig !== null,
      }}
    >
      {children}
    </MultisigContext.Provider>
  );
}

export function useMultisig() {
  const context = useContext(MultisigContext);
  if (!context) {
    throw new Error("useMultisig must be used within a MultisigProvider");
  }
  return context;
}
