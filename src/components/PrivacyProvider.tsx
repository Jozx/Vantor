import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface PrivacyCtx {
  showValues: boolean;
  setShowValues: (v: boolean) => void;
}

const PrivacyContext = createContext<PrivacyCtx>({ showValues: true, setShowValues: () => {} });

export function usePrivacy() {
  return useContext(PrivacyContext);
}

function readStored(): boolean {
  try {
    const stored = localStorage.getItem('vantor-show-values');
    if (stored === 'false') return false;
  } catch { /* private mode */ }
  return true;
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [showValues, setShowValuesState] = useState(readStored);

  useEffect(() => {
    try {
      localStorage.setItem('vantor-show-values', String(showValues));
    } catch { /* private mode */ }
  }, [showValues]);

  const setShowValues = (v: boolean) => setShowValuesState(v);

  return (
    <PrivacyContext.Provider value={{ showValues, setShowValues }}>
      {children}
    </PrivacyContext.Provider>
  );
}
