"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import SimulatedTipPanel from "@/components/SimulatedTipPanel";

type PerformedRole = "EXPLORER" | "TELEPORTER";
type PublicReview = { rating: number; comment: string | null; submittedAt: string; author: { role: PerformedRole; displayName: string } };
type ReviewState = {
  eligible: boolean; deadlineAt: string | null; performedRole: PerformedRole; counterpartyRole: PerformedRole; counterpartyDisplayName: string; canSubmit: boolean;
  myReview: { rating: number; comment: string | null; submittedAt: string } | null; revealedReviews: PublicReview[];
  reputation: { average: number | null; count: number; comments: PublicReview[]; nextCursor: string | null };
};
const roleName = (role: PerformedRole) => role === "EXPLORER" ? "Explorer" : "Teleporter";
const stars = (rating: number) => `${"★".repeat(rating)}${"☆".repeat(5 - rating)} (${rating} of 5)`;
const boundedError = (code: unknown, fallback: string) => {
  if (code === "INVALID_REVIEW") return "Choose a rating from 1 to 5 and keep the optional comment within 1,000 characters.";
  if (code === "JOURNEY_NOT_FOUND") return "Review details are unavailable for this Journey.";
  if (code === "JOURNEY_NOT_COMPLETED" || code === "JOURNEY_REVIEW_UNSUPPORTED") return "Reviews are unavailable for this Journey.";
  if (code === "INVALID_REPUTATION_CURSOR") return "More reputation details could not be loaded. Refresh the review state and try again.";
  return fallback;
};

export default function JourneyReviewAndTipPanel({ tripId }: { tripId: string }) {
  return <><JourneyReviewPanel tripId={tripId}/><SimulatedTipPanel tripId={tripId}/></>;
}

function JourneyReviewPanel({ tripId }: { tripId: string }) {
  const [state, setState] = useState<ReviewState | null>(null), [rating, setRating] = useState(0), [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(""), [announcement, setAnnouncement] = useState("");
  const lock = useRef(false), success = useRef<HTMLParagraphElement>(null), errorNotice = useRef<HTMLParagraphElement>(null);
  const errorId = `journey-review-error-${tripId}`, countId = `review-count-${tripId}`;
  const focusError = useCallback((message: string) => { setError(message); requestAnimationFrame(() => errorNotice.current?.focus()); }, []);
  const load = useCallback(async (cursor?: string) => {
    const response = await fetch(`/api/trips/${tripId}/review${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(boundedError(body.code, "Review details are temporarily unavailable."));
    setState(current => cursor && current ? { ...body.review, reputation: { ...body.review.reputation, comments: [...current.reputation.comments, ...body.review.reputation.comments] } } : body.review);
  }, [tripId]);
  useEffect(() => { void load().catch(value => setError(value instanceof Error ? value.message : "Review details are temporarily unavailable.")).finally(() => setLoading(false)); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (lock.current) return;
    if (rating < 1 || rating > 5) { focusError("Choose a rating from 1 to 5 stars."); return; }
    if (comment.length > 1000) { focusError("Comment must be 1,000 characters or fewer."); return; }
    lock.current = true; setSubmitting(true); setError(""); setAnnouncement("");
    try {
      const response = await fetch(`/api/trips/${tripId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (["REVIEW_ALREADY_SUBMITTED", "REVIEW_WINDOW_CLOSED"].includes(body.code)) { await load(); setAnnouncement(body.code === "REVIEW_WINDOW_CLOSED" ? "The review window has closed." : "Your existing review has been restored."); requestAnimationFrame(() => success.current?.focus()); return; }
        if (body.code === "REVIEW_CHANGED_CONCURRENTLY") { await load(); focusError("Review state changed. Check the refreshed details and try again."); return; }
        focusError(boundedError(body.code, "Review could not be submitted. Your entries have been preserved.")); return;
      }
      await load(); setAnnouncement("Your review was submitted and cannot be edited."); requestAnimationFrame(() => success.current?.focus());
    } catch (value) { focusError(value instanceof Error ? value.message : "Review could not be submitted. Your entries have been preserved."); }
    finally { lock.current = false; setSubmitting(false); }
  }
  async function loadMore() {
    if (!state?.reputation.nextCursor || loadingMore) return; setLoadingMore(true); setError("");
    try { await load(state.reputation.nextCursor); } catch (value) { focusError(value instanceof Error ? value.message : "More reputation details could not be loaded."); } finally { setLoadingMore(false); }
  }
  if (loading) return <section className="mt-3 rounded-lg border p-4" aria-busy="true"><p role="status">Loading Journey review…</p></section>;
  if (!state) return <section className="mt-3 rounded-lg border p-4"><p role="alert">{error || "Review details are unavailable."}</p><button className="mt-3 min-h-11 rounded-lg border px-4" onClick={() => { setLoading(true); setError(""); void load().catch(value => setError(value instanceof Error ? value.message : "Review details are temporarily unavailable.")).finally(() => setLoading(false)); }}>Retry</button></section>;
  const ownRevealed = state.revealedReviews.filter(value => value.author.role === state.performedRole), received = state.revealedReviews.filter(value => value.author.role === state.counterpartyRole);
  const inputError = error.startsWith("Choose a rating") || error.startsWith("Comment must");
  const describedBy = inputError ? `${countId} ${errorId}` : countId;
  return <section className="mt-3 min-w-0 rounded-lg border bg-white p-4" aria-labelledby={`journey-review-${tripId}`}>
    <h3 id={`journey-review-${tripId}`} className="text-lg font-semibold">Review {state.counterpartyDisplayName}, your {roleName(state.counterpartyRole)}</h3>
    {!state.deadlineAt ? <p className="mt-2 text-sm text-gray-600">Reviews are unavailable for this Journey.</p> : <><p className="mt-1 text-sm text-gray-600">Review window ends {new Date(state.deadlineAt).toLocaleString()}.</p><p className="mt-2 text-sm">Reviews are revealed together after both participants submit, or after the review window closes. Your review cannot be edited or withdrawn.</p>
      {state.canSubmit ? <form onSubmit={submit} className="mt-4 grid min-w-0 gap-4" aria-describedby={inputError ? errorId : undefined}><fieldset aria-describedby={inputError ? errorId : undefined}><legend className="font-medium">Rating for {state.counterpartyDisplayName}, the {roleName(state.counterpartyRole)} <span aria-hidden="true">*</span></legend><div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map(value => <label key={value} className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-3 focus-within:ring-2"><input className="mr-2" type="radio" name={`rating-${tripId}`} value={value} checked={rating === value} onChange={() => setRating(value)} required/><span>{value} <span aria-hidden="true">★</span><span className="sr-only"> star{value === 1 ? "" : "s"}</span></span></label>)}</div></fieldset><div><label htmlFor={`review-comment-${tripId}`} className="font-medium">Comment <span className="font-normal text-gray-600">(optional, 1,000 characters maximum)</span></label><textarea id={`review-comment-${tripId}`} maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} aria-invalid={inputError} aria-describedby={describedBy} className="mt-1 min-h-28 w-full resize-y rounded-lg border px-3 py-2 focus-visible:ring-2"/><p id={countId} className="mt-1 text-xs text-gray-600">{comment.length}/1,000 characters</p></div><button disabled={submitting} aria-disabled={submitting} className="min-h-11 rounded-lg bg-spartan-green px-4 font-semibold text-white disabled:opacity-50">{submitting ? "Submitting review…" : "Submit immutable review"}</button></form>
      : state.myReview && !state.revealedReviews.length ? <div className="mt-4 rounded-lg bg-green-50 p-3"><h4 className="font-semibold">Your review is submitted</h4><p className="text-sm">{stars(state.myReview.rating)}</p>{state.myReview.comment && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{state.myReview.comment}</p>}<p className="mt-2 text-sm">It will be revealed according to the review policy. No further action is available.</p></div>
      : !state.eligible && !state.revealedReviews.length ? <p className="mt-4 text-sm font-medium">The review window is closed. No reviews are available.</p> : null}
      {state.revealedReviews.length > 0 && <div className="mt-5"><h4 className="font-semibold">Revealed Journey reviews</h4>{ownRevealed.map((value, index) => <ReviewCard key={`own-${index}`} review={value} label="Review you wrote"/>)}{received.map((value, index) => <ReviewCard key={`received-${index}`} review={value} label="Review you received"/>)}</div>}
      <div className="mt-5 border-t pt-4"><h4 className="font-semibold">{roleName(state.counterpartyRole)} reputation</h4>{state.reputation.count === 0 ? <p className="mt-1 text-sm text-gray-600">No reviews yet for this participant as a {roleName(state.counterpartyRole)}</p> : <><p className="mt-1 text-sm">{state.reputation.average!.toFixed(1)} out of 5 · {state.reputation.count} review{state.reputation.count === 1 ? "" : "s"} as a {roleName(state.counterpartyRole)}</p><div className="mt-3 grid gap-3">{state.reputation.comments.map((value, index) => <ReviewCard key={`${value.submittedAt}-${index}`} review={value}/>)}</div>{state.reputation.nextCursor && <button disabled={loadingMore} aria-disabled={loadingMore} onClick={() => void loadMore()} className="mt-3 min-h-11 rounded-lg border px-4">{loadingMore ? "Loading more reviews…" : "Load more reviews"}</button>}</>}</div>
    </>}{announcement && <p ref={success} tabIndex={-1} role="status" aria-live="polite" className="mt-3 text-sm text-green-800 focus:outline-none focus-visible:ring-2">{announcement}</p>}{error && <div className="mt-3"><p id={errorId} ref={errorNotice} tabIndex={-1} role="alert" className="text-sm text-red-800 focus:outline-none focus-visible:ring-2">{error}</p><button onClick={() => void load()} className="mt-2 min-h-11 rounded-lg border px-4">Refresh review state</button></div>}</section>;
}
function ReviewCard({ review, label }: { review: PublicReview; label?: string }) { return <article className="mt-3 min-w-0 rounded-lg border bg-gray-50 p-3">{label && <p className="text-xs font-semibold uppercase text-gray-600">{label}</p>}<p className="font-medium break-words">{review.author.displayName} · {roleName(review.author.role)}</p><p className="text-sm" aria-label={`${review.rating} out of 5 stars`}>{stars(review.rating)}</p>{review.comment && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{review.comment}</p>}<p className="mt-2 text-xs text-gray-600">Submitted {new Date(review.submittedAt).toLocaleString()}</p></article>; }
