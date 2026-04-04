import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

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

const MultisigContext = createContext<MultisigContextType | null>(null);

export function MultisigProvider({ children }: { children: ReactNode }) {
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigDeployment | null>(null);

  const selectMultisig = useCallback((multisig: MultisigDeployment) => {
    setSelectedMultisig(multisig);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedMultisig(null);
  }, []);

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
