"use client";

import { useState } from "react";
import { Button, Choice } from "@/components/ui/primitives";

export default function FeedbackForm({
  tripId,
  onDone,
  embedded = false,
}: {
  tripId: string;
  onDone: () => void;
  embedded?: boolean;
}) {
  const [presence, setPresence] = useState(3);
  const [mediaQuality, setMediaQuality] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, presence, mediaQuality }),
      });

      if (response.ok) {
        onDone();
      } else {
        setError("Unable to submit feedback. Please try again or skip.");
      }
    } catch {
      setError("Unable to submit feedback. Please try again or skip.");
    } finally {
      setSubmitting(false);
    }
  }

  async function skip() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      if (response.ok) onDone();
      else setError("Unable to skip feedback. Please try again.");
    } catch {
      setError("Unable to skip feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const scale = [1, 2, 3, 4, 5];
  const Heading = embedded ? "h3" : "h1";

  return (
    <section className={embedded ? "mt-4" : "mx-auto max-w-md px-4 py-10"} aria-labelledby={`feedback-heading-${tripId}`}>
      <Heading id={`feedback-heading-${tripId}`} className="mb-6 text-heading-2">
        How was your Journey?
      </Heading>

      <fieldset className="mb-6">
        <legend className="mb-2 text-label text-ink">
          I felt like I was really there.
        </legend>
        <div className="flex flex-wrap gap-2">
          {scale.map((n) => (
            <Choice
              key={n}
              type="radio"
              name={`presence-${tripId}`}
              value={n}
              checked={presence === n}
              onChange={() => setPresence(n)}
              label={`${n} of 5`}
              className={`min-w-16 border ${presence === n ? "border-brand bg-brand-subtle" : "border-line"}`}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-8">
        <legend className="mb-2 text-label text-ink">
          The video was clear enough to see details.
        </legend>
        <div className="flex flex-wrap gap-2">
          {scale.map((n) => (
            <Choice
              key={n}
              type="radio"
              name={`media-quality-${tripId}`}
              value={n}
              checked={mediaQuality === n}
              onChange={() => setMediaQuality(n)}
              label={`${n} of 5`}
              className={`min-w-16 border ${mediaQuality === n ? "border-brand bg-brand-subtle" : "border-line"}`}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="primary"
          onClick={submit}
          disabled={submitting}
          className="w-full sm:w-auto"
        >
          {submitting ? "Submitting…" : "Submit private Feedback"}
        </Button>
        <Button variant="quiet" onClick={skip} disabled={submitting} className="w-full sm:w-auto">
          Skip
        </Button>
      </div>
      {error && <p className="mt-4 text-body-sm text-danger-fg" role="alert">{error}</p>}
    </section>
  );
}
