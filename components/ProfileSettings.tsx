"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requireJsonResponse } from "@/lib/resilient-poller";
import { Button, Field, Notice, Select, StatePanel, Surface } from "@/components/ui/primitives";

const LANGUAGES = ["English", "Spanish", "French", "Portuguese"];
const ACCESSIBILITY = ["Wheelchair-accessible route support", "Low-noise environment preference", "Visual-description assistance", "Slower-paced visit", "Other"];
type Feedback = { kind: "success" | "error"; text: string } | null;

export default function ProfileSettings({ role, heading = "Your profile", description }: { role: "viewer" | "operator"; heading?: string; description?: string }) {
  const [displayName, setDisplayName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [accessibilityPreferences, setAccessibilityPreferences] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unauthorized" | "failed">("loading");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const endpoint = `/api/${role}/profile`;

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading"); setFeedback(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      if (response.status === 401 || response.status === 403) { setState("unauthorized"); return; }
      const data = await requireJsonResponse<{ profile: { displayName: string; preferredLanguage?: string | null; accessibilityPreferences?: string[] } }>(response);
      setDisplayName(data.profile.displayName); setPreferredLanguage(data.profile.preferredLanguage ?? ""); setAccessibilityPreferences(data.profile.accessibilityPreferences ?? []); setState("ready");
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setState("failed"); }
  }, [endpoint]);

  useEffect(() => { const request = new AbortController(); void load(request.signal); return () => request.abort(); }, [load]);

  async function save() {
    if (saving.current) return;
    saving.current = true; setIsSaving(true); setFeedback(null);
    try {
      const body = role === "viewer" ? { displayName, preferredLanguage, accessibilityPreferences } : { displayName };
      await requireJsonResponse(await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      setFeedback({ kind: "success", text: "Profile saved." });
      if (role === "operator") window.dispatchEvent(new Event("operator-profile-updated"));
    } catch (error) { setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Profile could not be saved." }); }
    finally { saving.current = false; setIsSaving(false); }
  }

  if (state === "loading") return <section className="mt-8" aria-labelledby={`${role}-profile-heading`}><h2 id={`${role}-profile-heading`} className="sr-only">{heading}</h2><StatePanel title="Loading profile" busy><p role="status">Loading your public profile…</p></StatePanel></section>;
  if (state === "unauthorized") return <section className="mt-8" aria-labelledby={`${role}-profile-heading`}><h2 id={`${role}-profile-heading`} className="sr-only">{heading}</h2><StatePanel title="Profile access unavailable" tone="danger"><p role="alert">You are not authorized to view this profile.</p></StatePanel></section>;
  if (state === "failed") return <section className="mt-8" aria-labelledby={`${role}-profile-heading`}><h2 id={`${role}-profile-heading`} className="sr-only">{heading}</h2><StatePanel title="Profile could not be loaded" tone="danger" action={<Button variant="secondary" onClick={() => void load()}>Retry profile</Button>}><p role="alert">Your other account information remains available.</p></StatePanel></section>;

  return <Surface className="mt-8" aria-labelledby={`${role}-profile-heading`} aria-busy={isSaving || undefined}><h2 id={`${role}-profile-heading`} className="text-heading-2">{heading}</h2>{description && <p className="mt-2 text-body-sm text-ink-secondary">{description}</p>}<div className="mt-5"><Field id={`${role}-display-name`} label="Display name"><input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} className="unfar-control" /></Field></div>
    {role === "viewer" && <><div className="mt-5"><Field id="viewer-preferred-language" label="Preferred language"><Select value={preferredLanguage} onChange={event => setPreferredLanguage(event.target.value)}><option value="">No preference</option>{LANGUAGES.map(language => <option key={language}>{language}</option>)}</Select></Field></div><fieldset className="mt-5"><legend className="text-label">Accessibility preferences</legend>{ACCESSIBILITY.map(item => <label key={item} className="mt-2 flex min-h-control items-center gap-3 text-body-sm"><input type="checkbox" checked={accessibilityPreferences.includes(item)} onChange={event => setAccessibilityPreferences(current => event.target.checked ? [...current, item] : current.filter(value => value !== item))} />{item}</label>)}</fieldset></>}
    <Button className="mt-6 w-full sm:w-auto" onClick={() => void save()} disabled={isSaving}>{isSaving ? "Saving…" : "Save profile"}</Button>
    {feedback && <Notice className="mt-4" variant={feedback.kind === "error" ? "danger" : "success"} role={feedback.kind === "error" ? "alert" : "status"}><p>{feedback.text}</p></Notice>}
  </Surface>;
}
