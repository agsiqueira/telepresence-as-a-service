"use client";

import { useEffect, useRef, useState } from "react";
import { requireJsonResponse } from "@/lib/resilient-poller";

const LANGUAGES = ["English", "Spanish", "French", "Portuguese"];
const ACCESSIBILITY = ["Wheelchair-accessible route support", "Low-noise environment preference", "Visual-description assistance", "Slower-paced visit", "Other"];

export default function ProfileSettings({ role }: { role: "viewer" | "operator" }) {
  const [displayName, setDisplayName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [accessibilityPreferences, setAccessibilityPreferences] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unauthorized" | "failed">("loading");
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const endpoint = `/api/${role}/profile`;

  useEffect(() => {
    const request = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: request.signal }).then(response => {
      if (response.status === 401 || response.status === 403) { setState("unauthorized"); throw new DOMException("Stopped", "AbortError"); }
      return requireJsonResponse<{ profile: { displayName: string; preferredLanguage?: string | null; accessibilityPreferences?: string[] } }>(response);
    }).then(data => { setDisplayName(data.profile.displayName); setPreferredLanguage(data.profile.preferredLanguage ?? ""); setAccessibilityPreferences(data.profile.accessibilityPreferences ?? []); setState("ready"); }).catch(error => { if (!(error instanceof DOMException && error.name === "AbortError")) setState("failed"); });
    return () => request.abort();
  }, [endpoint]);

  async function save() {
    if (saving.current) return;
    saving.current = true;
    setMessage("");
    try {
      const body = role === "viewer" ? { displayName, preferredLanguage, accessibilityPreferences } : { displayName };
      await requireJsonResponse(await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      setMessage("Profile saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Profile could not be saved."); }
    finally { saving.current = false; }
  }

  if (state === "loading") return <section className="mt-8 rounded-xl border p-4" aria-busy="true">Loading profile…</section>;
  if (state === "unauthorized") return <section className="mt-8 rounded-xl border border-red-200 p-4 text-red-700" role="alert">You are not authorized to view this profile.</section>;
  if (state === "failed") return <section className="mt-8 rounded-xl border border-red-200 p-4 text-red-700" role="alert">Profile could not be loaded.</section>;
  return <section className="mt-8 min-w-0 rounded-xl border p-4" aria-labelledby={`${role}-profile-heading`}><h2 id={`${role}-profile-heading`} className="text-xl font-semibold">Your profile</h2><label className="mt-4 block text-sm font-medium">Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border px-3" /></label>{role === "viewer" && <><label className="mt-4 block text-sm font-medium">Preferred language<select value={preferredLanguage} onChange={event => setPreferredLanguage(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">No preference</option>{LANGUAGES.map(language => <option key={language}>{language}</option>)}</select></label><fieldset className="mt-4"><legend className="text-sm font-medium">Accessibility preferences</legend>{ACCESSIBILITY.map(item => <label key={item} className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={accessibilityPreferences.includes(item)} onChange={event => setAccessibilityPreferences(current => event.target.checked ? [...current, item] : current.filter(value => value !== item))} />{item}</label>)}</fieldset></>}<button type="button" onClick={save} className="mt-5 min-h-11 w-full rounded-lg bg-spartan-green px-4 font-semibold text-white focus-visible:ring-2">Save profile</button>{message && <p className="mt-3 text-sm" role="status">{message}</p>}</section>;
}
