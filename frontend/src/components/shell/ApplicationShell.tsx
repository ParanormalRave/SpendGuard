"use client";

import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { SettingsSheet } from "./SettingsSheet";

export function ApplicationShell({ children, banner }: { children: React.ReactNode; banner?: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertsNoteOpen, setAlertsNoteOpen] = useState(false);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  // Lock scroll when drawer/sheet open
  useEffect(() => {
    if (drawerOpen || settingsOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen, settingsOpen]);

  // Focus drawer close on open, handle Escape
  useEffect(() => {
    if (drawerOpen) drawerCloseRef.current?.focus();
  }, [drawerOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        setAlertsNoteOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen bg-ink">
      {/* Desktop sidebar */}
      <aside className="hidden w-[264px] shrink-0 border-r border-line bg-ink lg:flex lg:flex-col lg:px-4 lg:py-4">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-30 flex lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-overlay"
          />
          <div className="relative flex w-[264px] flex-col border-r border-line bg-ink px-4 py-4 shadow-panel">
            <button
              ref={drawerCloseRef}
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-paper"
            >
              ×
            </button>
            <Sidebar onNavigate={() => setDrawerOpen(false)} onOpenSettings={() => setSettingsOpen(true)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setDrawerOpen(true)} onOpenAlerts={() => setAlertsNoteOpen((v) => !v)} />
        {banner ?? null}

        {alertsNoteOpen ? (
          <div role="status" className="border-b border-caution/30 bg-caution-wash px-4 py-3 text-[0.9375rem] text-paper sm:px-6">
            Alerts are not available yet. This needs the backend <span className="font-mono text-[0.8125rem]">GET /alerts</span> route from Build Guide Phase 4.
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
