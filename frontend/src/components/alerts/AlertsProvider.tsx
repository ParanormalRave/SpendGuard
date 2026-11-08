"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchAlerts, type AlertDto } from "@/lib/api";
import { getReadDedupeKeys, markAllRead as markAllReadStore, markRead as markReadStore } from "@/lib/readState";

interface AlertsContextValue {
  ownerAlerts: AlertDto[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  unreadAlerts: AlertDto[];
  isRead: (dedupeKey: string) => boolean;
  markRead: (dedupeKey: string) => void;
  markAllRead: () => void;
  refresh: () => Promise<void>;
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

export function useAlertsContext(): AlertsContextValue {
  const v = useContext(AlertsContext);
  if (!v) throw new Error("useAlertsContext must be inside AlertsProvider");
  return v;
}

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const owner = wallet.publicKey?.toBase58() ?? null;

  const [alerts, setAlerts] = useState<AlertDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readKeys, setReadKeys] = useState<Set<string>>(() => {
    try {
      return getReadDedupeKeys();
    } catch {
      return new Set();
    }
  });

  const refresh = useCallback(async () => {
    if (!owner) {
      setAlerts([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchAlerts({ owner, limit: 100 });
      setAlerts(res.alerts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [owner]);

  // Initial + 10s poll, pause when hidden
  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refresh();
    }, 10_000);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  // Keep readKeys in sync after mark
  const markRead = useCallback((dedupeKey: string) => {
    markReadStore(dedupeKey);
    setReadKeys(new Set(getReadDedupeKeys()));
  }, []);

  const markAllRead = useCallback(() => {
    const keys = alerts.map((a) => a.dedupeKey);
    markAllReadStore(keys);
    setReadKeys(new Set(getReadDedupeKeys()));
  }, [alerts]);

  const isRead = useCallback((k: string) => readKeys.has(k), [readKeys]);

  const unreadAlerts = useMemo(() => alerts.filter((a) => !readKeys.has(a.dedupeKey)), [alerts, readKeys]);

  const value: AlertsContextValue = {
    ownerAlerts: alerts,
    loading,
    error,
    unreadCount: unreadAlerts.length,
    unreadAlerts,
    isRead,
    markRead,
    markAllRead,
    refresh,
  };

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}
