import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Lets any in-app page feed the shared sticky Header a title/back-target/
// right-side action instead of building its own local header. Mirrors the
// shape of setting a document title in a useEffect: call useHeaderConfig on
// mount (and whenever `deps` change), it clears itself on unmount.
export type HeaderConfig = {
  title: string;
  // Passed to navigate(); omit to just go back one entry in history.
  backTo?: string;
  rightAction?: ReactNode;
};

type HeaderContextValue = {
  config: HeaderConfig | null;
  setConfig: (config: HeaderConfig | null) => void;
};

const HeaderContext = createContext<HeaderContextValue | null>(null);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<HeaderConfig | null>(null);
  const value = useMemo(() => ({ config, setConfig }), [config]);
  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}

export function useHeaderContextValue(): HeaderContextValue {
  const ctx = useContext(HeaderContext);
  if (!ctx) throw new Error("useHeaderContextValue must be used within a HeaderProvider");
  return ctx;
}

// eslint-disable-next-line react-hooks/exhaustive-deps
export function useHeaderConfig(config: HeaderConfig, deps: unknown[] = []) {
  const { setConfig } = useHeaderContextValue();

  useEffect(() => {
    setConfig(config);
    return () => setConfig(null);
    // Intentionally keyed off the caller-supplied deps array, not `config`
    // itself, so callers don't need to memoize the config object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
