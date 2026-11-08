"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { GoogleLogin } from "@react-oauth/google";
import bs58 from "bs58";
import { GOOGLE_CLIENT_ID } from "@/lib/env";
import { CloseIcon } from "@/components/ui/Icons";
import { fetchMe, getAuthNonce, getToken, linkGoogleAccount, sendTestEmail, unlinkAccount, updateNotificationPrefs, clearToken } from "@/lib/auth";

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wallet = useWallet();
  const address = wallet.publicKey?.toBase58() ?? null;
  const signMessage = (wallet as unknown as { signMessage?: (msg: Uint8Array) => Promise<Uint8Array> }).signMessage;
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const [googleCredential, setGoogleCredential] = useState<string | null>(null);
  const [me, setMe] = useState<{ email: string; emailEnabled: boolean; minSeverity: string } | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const hasToken = !!getToken();

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      closeBtnRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Load /me when drawer opens and token exists
  useEffect(() => {
    if (!open || !hasToken) {
      setMe(null);
      return;
    }
    let cancelled = false;
    setLoadingMe(true);
    setError(null);
    fetchMe()
      .then((data) => {
        if (!cancelled) setMe({ email: data.email, emailEnabled: data.emailEnabled, minSeverity: data.minSeverity });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingMe(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, hasToken]);

  async function handleGoogleSuccess(credential: string) {
    setError(null);
    setGoogleCredential(credential);
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (!signMessage) {
      setError("This wallet cannot sign messages. Try Phantom or Solflare.");
      return;
    }
    setLinking(true);
    try {
      const { nonce, message } = await getAuthNonce(address);
      const sigBytes = await signMessage.call(wallet, new TextEncoder().encode(message));
      const signature = bs58.encode(sigBytes);
      const res = await linkGoogleAccount({ idToken: credential, wallet: address, signature, nonce });
      setMe({ email: res.email, emailEnabled: true, minSeverity: "warning" });
      setGoogleCredential(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }

  if (!open) return null;

  const showNotConfigured = !GOOGLE_CLIENT_ID;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close settings" onClick={onClose} className="absolute inset-0 bg-overlay" />
      <div role="dialog" aria-modal="true" aria-label="Notifications" className="relative flex h-full w-full max-w-[380px] flex-col border-l border-line bg-surface-raised shadow-panel">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-[1.125rem] font-semibold text-paper">Notifications</h2>
          <button ref={closeBtnRef} type="button" onClick={onClose} aria-label="Close settings" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-paper">
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {showNotConfigured ? (
            <p className="rounded-control border border-line bg-panel px-3 py-3 text-[0.9375rem] text-muted">Email alerts are not configured</p>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-[0.8125rem] font-semibold text-paper">Wallet</h3>
                <p className="break-all font-mono text-[0.8125rem] text-paper">{address ?? "No wallet connected. Connect from the top bar."}</p>
              </section>

              {!me ? (
                <section className="mt-6 space-y-3 border-t border-line pt-6">
                  <h3 className="text-[0.8125rem] font-semibold text-paper">Sign in with Google</h3>
                  <p className="text-[0.8125rem] text-muted">Link your wallet to an email to receive critical alerts.</p>
                  {!address ? (
                    <p className="text-[0.8125rem] text-muted">Connect a wallet first.</p>
                  ) : (
                    <GoogleLogin
                      onSuccess={(res) => {
                        const cred = (res as { credential?: string }).credential;
                        if (!cred) {
                          setError("Google sign-in failed: no credential");
                          return;
                        }
                        void handleGoogleSuccess(cred);
                      }}
                      onError={() => setError("Google sign-in failed")}
                    />
                  )}
                  {linking ? <p className="text-[0.8125rem] text-muted">Signing message and linking…</p> : null}
                  {error ? <p className="rounded-control border border-blocked/30 bg-blocked-wash px-3 py-2 text-[0.8125rem] text-blocked">{error}</p> : null}
                </section>
              ) : (
                <>
                  <section className="mt-6 space-y-2 border-t border-line pt-6">
                    <h3 className="text-[0.8125rem] font-semibold text-paper">Linked email</h3>
                    <p className="text-[0.9375rem] text-paper">{me.email}</p>
                    <p className="text-[0.8125rem] text-muted">Wallet {address?.slice(0, 4)}…{address?.slice(-4)}</p>
                  </section>

                  <section className="mt-6 space-y-3 border-t border-line pt-6">
                    <h3 className="text-[0.8125rem] font-semibold text-paper">Email preferences</h3>
                    <label className="flex items-center gap-2 text-[0.9375rem] text-paper">
                      <input
                        type="checkbox"
                        checked={me.emailEnabled}
                        onChange={async (e) => {
                          const v = e.target.checked;
                          setError(null);
                          try {
                            const updated = await updateNotificationPrefs({ emailEnabled: v });
                            setMe({ email: updated.email, emailEnabled: updated.emailEnabled, minSeverity: updated.minSeverity });
                          } catch (err) {
                            setError(err instanceof Error ? err.message : String(err));
                          }
                        }}
                        className="h-4 w-4"
                      />
                      Email alerts on
                    </label>
                    <label className="block text-[0.9375rem] text-paper">
                      Minimum severity
                      <select
                        value={me.minSeverity}
                        onChange={async (e) => {
                          const v = e.target.value;
                          setError(null);
                          try {
                            const updated = await updateNotificationPrefs({ minSeverity: v });
                            setMe({ email: updated.email, emailEnabled: updated.emailEnabled, minSeverity: updated.minSeverity });
                          } catch (err) {
                            setError(err instanceof Error ? err.message : String(err));
                          }
                        }}
                        className="mt-1 w-full rounded-control border border-line bg-panel px-3 py-2 text-[0.9375rem] text-paper"
                      >
                        <option value="info">info</option>
                        <option value="warning">warning</option>
                        <option value="critical">critical</option>
                      </select>
                    </label>
                    {error ? <p className="rounded-control border border-blocked/30 bg-blocked-wash px-3 py-2 text-[0.8125rem] text-blocked">{error}</p> : null}
                  </section>

                  <section className="mt-6 flex flex-col gap-2 border-t border-line pt-6">
                    <button
                      type="button"
                      onClick={async () => {
                        setTestStatus(null);
                        setError(null);
                        try {
                          await sendTestEmail();
                          setTestStatus("Test email sent");
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err));
                        }
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-4 text-[0.9375rem] font-semibold text-on-accent"
                    >
                      Send test email
                    </button>
                    {testStatus ? <p className="text-[0.8125rem] text-allowed">{testStatus}</p> : null}
                    <button
                      type="button"
                      onClick={async () => {
                        setError(null);
                        try {
                          await unlinkAccount();
                          setMe(null);
                          setGoogleCredential(null);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err));
                        }
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-control border border-line px-4 text-[0.9375rem] font-semibold text-paper"
                    >
                      Unlink
                    </button>
                  </section>
                </>
              )}

              {loadingMe ? <p className="mt-4 text-[0.8125rem] text-muted">Loading…</p> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Keep alias for spec naming
export const NotificationsDrawer = SettingsSheet;
