"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button, Choice, Field, LiveRegion, Notice, Select, Skeleton, StatePanel, Surface } from "@/components/ui/primitives";
import { requireJsonResponse } from "@/lib/resilient-poller";

const LANGUAGES = ["English", "Spanish", "French", "Portuguese"];
const ACCESSIBILITY = ["Wheelchair-accessible route support", "Low-noise environment preference", "Visual-description assistance", "Slower-paced visit", "Other"];
type Profile = { displayName: string; preferredLanguage: string; accessibilityPreferences: string[] };
type LoadState = "loading" | "ready" | "unauthorized" | "failed";

const emptyProfile: Profile = { displayName: "", preferredLanguage: "", accessibilityPreferences: [] };

export default function ExplorerProfileSettings() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [state, setState] = useState<LoadState>("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/viewer/profile", { cache: "no-store", signal });
      if (response.status === 401 || response.status === 403) { setState("unauthorized"); return; }
      const data = await requireJsonResponse<{ profile: { displayName: string; preferredLanguage?: string | null; accessibilityPreferences?: string[] } }>(response);
      setProfile({ displayName: data.profile.displayName, preferredLanguage: data.profile.preferredLanguage ?? "", accessibilityPreferences: data.profile.accessibilityPreferences ?? [] });
      setState("ready");
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setState("failed");
    }
  }, []);

  useEffect(() => { const request = new AbortController(); void load(request.signal); return () => request.abort(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const normalizedName = profile.displayName.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 1 || normalizedName.length > 80 || /\S+@\S+\.\S+/.test(normalizedName)) {
      setError("Enter a display name between 1 and 80 characters");
      requestAnimationFrame(() => document.getElementById("explorer-display-name")?.focus());
      return;
    }
    setSaving(true); setMessage(""); setError(""); setConflict(false);
    try {
      const response = await fetch("/api/viewer/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      if (response.status === 409) { setConflict(true); throw new Error("Your profile changed elsewhere. Reload the server version before saving again."); }
      const data = await requireJsonResponse<{ profile: { displayName: string; preferredLanguage?: string | null; accessibilityPreferences?: string[] } }>(response);
      setProfile({ displayName: data.profile.displayName, preferredLanguage: data.profile.preferredLanguage ?? "", accessibilityPreferences: data.profile.accessibilityPreferences ?? [] });
      setMessage("Explorer profile saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
      requestAnimationFrame(() => resultRef.current?.focus());
    }
  }

  if (state === "loading") return <Surface aria-busy="true" aria-labelledby="explorer-profile-loading"><h2 id="explorer-profile-loading" className="text-heading-2">Explorer profile</h2><Skeleton className="mt-5 w-1/3"/><Skeleton className="mt-3 w-full"/><Skeleton className="mt-6 w-2/5"/><Skeleton className="mt-3 w-full"/><span className="sr-only" role="status">Loading Explorer profile…</span></Surface>;
  if (state === "unauthorized") return <StatePanel title="Explorer profile is unavailable" tone="danger"><p>Your current account cannot access this Explorer profile. Reloading will not change the authorization boundary.</p></StatePanel>;
  if (state === "failed") return <StatePanel title="Explorer profile could not be loaded" tone="danger" action={<Button variant="secondary" onClick={() => void load()}>Retry Explorer profile</Button>}><p>Your account and support links remain available.</p></StatePanel>;

  return <Surface>
    <div className="max-w-prose"><h2 className="text-heading-2">Explorer profile</h2><p className="mt-2 text-body-sm text-ink-secondary">These application-managed details help Teleporters understand how to support your Journeys. Changes require saving.</p></div>
    <form className="mt-6 grid gap-6" onSubmit={save} noValidate>
      <Field id="explorer-display-name" label="Display name" description="Required. Enter 1–80 characters; email addresses cannot be used." error={error && /display name/i.test(error) ? error : undefined}>
        <input className="unfar-control" value={profile.displayName} maxLength={80} autoComplete="name" disabled={saving} onChange={event => setProfile(current => ({ ...current, displayName: event.target.value }))}/>
      </Field>
      <Field id="explorer-preferred-language" label="Preferred language" description="Optional. Teleporters can use this preference when planning a Journey." optional>
        <Select value={profile.preferredLanguage} disabled={saving} onChange={event => setProfile(current => ({ ...current, preferredLanguage: event.target.value }))}><option value="">No preference</option>{LANGUAGES.map(language => <option key={language}>{language}</option>)}</Select>
      </Field>
      <fieldset disabled={saving}><legend className="text-label text-ink">Accessibility preferences <span className="font-normal text-ink-muted">(optional)</span></legend><p className="mt-1 text-body-sm text-ink-muted">Select only the support that would make your Journeys more comfortable.</p><div className="mt-3 grid gap-1">{ACCESSIBILITY.map(item => <Choice key={item} type="checkbox" label={item} checked={profile.accessibilityPreferences.includes(item)} onChange={event => setProfile(current => ({ ...current, accessibilityPreferences: event.target.checked ? [...current.accessibilityPreferences, item] : current.accessibilityPreferences.filter(value => value !== item) }))}/>)}</div></fieldset>
      {conflict && <Notice variant="warning" title="Server profile changed"><p>Reload the authoritative profile before making another change.</p><Button className="mt-3" variant="secondary" onClick={() => void load()}>Reload server profile</Button></Notice>}
      {error && !/display name/i.test(error) && <Notice variant="danger" title="Profile was not saved"><p>{error}</p><p className="mt-1">Your entered values are still available above.</p></Notice>}
      <div ref={resultRef} tabIndex={-1}><LiveRegion>{message}</LiveRegion></div>
      <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center"><Button type="submit" disabled={saving}>{saving ? "Saving profile…" : "Save profile"}</Button><p className="text-body-sm text-ink-muted">The server confirms and normalizes saved values.</p></div>
    </form>
  </Surface>;
}
