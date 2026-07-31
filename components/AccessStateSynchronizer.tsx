"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { accessStateDestinations, createAccessStateSynchronizer, parseAccessStateMessage, serializeAccessStateMessage, type SafeAccessState } from "@/lib/access-state-sync";

const TRANSIENT_MESSAGE_KEY = "virtualtrip-access-state-message";

function validState(value: unknown): value is SafeAccessState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return ["VIEWER", "OPERATOR", "ADMIN"].includes(String(state.role)) && ["ACTIVE", "DEACTIVATED"].includes(String(state.accountStatus)) && typeof state.explorer === "boolean" && typeof state.teleporter === "boolean" && typeof state.teleporterObligation === "boolean" && typeof state.updatedAt === "string" && !Number.isNaN(Date.parse(state.updatedAt));
}

function routeMatchesCapabilities(pathname: string, state: SafeAccessState) {
  if (state.role === "ADMIN") return pathname === "/admin" || pathname.startsWith("/admin/");
  if (state.explorer && (pathname === "/viewer" || pathname.startsWith("/viewer/"))) return true;
  return (state.teleporter || state.teleporterObligation) && (pathname === "/operator" || pathname.startsWith("/operator/"));
}

function setProtectedContentInert(blocked: boolean) {
  document.querySelectorAll<HTMLElement>("body > header, body > main").forEach(element => { element.inert = blocked; });
}

export default function AccessStateSynchronizer() {
  const router = useRouter(), pathname = usePathname();
  const [message, setMessage] = useState(""); const [blocking, setBlocking] = useState(false);
  useEffect(() => {
    if (pathname === "/account-deactivated") { setBlocking(false); setProtectedContentInert(false); }
    const stored = sessionStorage.getItem(TRANSIENT_MESSAGE_KEY), pending = parseAccessStateMessage(stored);
    if (pending) setMessage(pending); else if (stored) sessionStorage.removeItem(TRANSIENT_MESSAGE_KEY);
    const synchronizer = createAccessStateSynchronizer({
      isVisible: () => document.visibilityState !== "hidden",
      addFocusListener: listener => { window.addEventListener("focus", listener); return () => window.removeEventListener("focus", listener); },
      addVisibilityListener: listener => { document.addEventListener("visibilitychange", listener); return () => document.removeEventListener("visibilitychange", listener); },
      fetchState: async signal => {
        const response = await fetch("/api/access-state", { cache: "no-store", signal, headers: { Accept: "application/json" } });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Access state unavailable");
        const state: unknown = await response.json(); if (!validState(state)) throw new Error("Invalid access state"); return state;
      },
      onChange: async (_previous, next, notification) => {
        const serialized = serializeAccessStateMessage(notification); if (!serialized) return;
        sessionStorage.setItem(TRANSIENT_MESSAGE_KEY, serialized); setMessage(notification);
        if (next.accountStatus === "DEACTIVATED") { setBlocking(true); setProtectedContentInert(true); router.replace("/account-deactivated"); router.refresh(); return; }
        const destination = next.role === "ADMIN" ? accessStateDestinations.ADMIN : "/viewer";
        if (pathname === "/account-deactivated" || !routeMatchesCapabilities(pathname, next)) router.replace(destination);
        router.refresh();
      },
    });
    return () => { synchronizer.stop(); setProtectedContentInert(false); };
  }, [pathname, router]);
  function dismiss() { sessionStorage.removeItem(TRANSIENT_MESSAGE_KEY); setMessage(""); }
  return <>{blocking && <div className="fixed inset-0 z-[90] cursor-wait bg-white/80" aria-hidden="true" />}{message && <aside className="fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-2xl items-start justify-between gap-4 rounded-xl border border-blue-700 bg-blue-50 p-4 text-blue-950 shadow-lg" role="status" aria-live="polite" aria-atomic="true"><p>{message}</p><button className="min-h-11 shrink-0 rounded-lg border border-blue-800 px-3 focus-visible:ring-2" onClick={dismiss} aria-label="Dismiss access update">Dismiss</button></aside>}</>;
}
