"use client";

import { useState } from "react";

export default function FeedbackForm({
  tripId,
  onDone,
}: {
  tripId: string;
  onDone: () => void;
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

  const scale = [1, 2, 3, 4, 5];

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h2 className="text-xl font-semibold text-spartan-green mb-6">
        How was your visit?
      </h2>

      <div className="mb-6">
        <p className="mb-2 text-sm text-gray-700">
          I felt like I was really there.
        </p>
        <div className="flex gap-2">
          {scale.map((n) => (
            <button
              key={n}
              onClick={() => setPresence(n)}
              className={`w-10 h-10 rounded-full border ${
                presence === n
                  ? "bg-spartan-green text-white border-spartan-green"
                  : "border-gray-300"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <p className="mb-2 text-sm text-gray-700">
          The video was clear enough to see details.
        </p>
        <div className="flex gap-2">
          {scale.map((n) => (
            <button
              key={n}
              onClick={() => setMediaQuality(n)}
              className={`w-10 h-10 rounded-full border ${
                mediaQuality === n
                  ? "bg-spartan-green text-white border-spartan-green"
                  : "border-gray-300"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={submitting}
          className="bg-spartan-green text-white px-5 py-2 rounded-md font-medium disabled:opacity-50"
        >
          Submit
        </button>
        <button onClick={onDone} className="text-gray-500 px-5 py-2">
          Skip
        </button>
      </div>
      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
    </div>
  );
}
