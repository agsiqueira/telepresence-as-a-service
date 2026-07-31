"use client";

import { useCallback, useEffect, useState } from "react";

export type AgreementView = { id:string; tripId:string; proposalId:string; agreedEarliestStart:string; agreedLatestStart:string|null; agreedDurationMinutes:number; agreedPriceMinor:number; currency:string; publicPlaceNameSnapshot:string; coarseLocationSnapshot:string; privateMeetingSnapshot:string|null; status:string; confirmedAt:string };

export default function AgreementConfirmation({ requestId, refresh = 0 }: { requestId: string; refresh?: number }) {
  const [agreement,setAgreement]=useState<AgreementView|null>(null);
  const load=useCallback(async()=>{const response=await fetch(`/api/journey-requests/${requestId}/agreement`,{cache:"no-store"});if(response.status===404)return setAgreement(null);const data=await response.json();if(response.ok)setAgreement(data.agreement)},[requestId]);
  useEffect(()=>{void load()},[load,refresh]);
  if(!agreement)return null;
  return <section className="mx-auto mt-6 max-w-2xl rounded-xl border border-green-700 bg-green-50 p-5"><p className="text-sm font-semibold uppercase text-green-800">Journey confirmed</p><h2 className="mt-1 text-xl font-bold">{agreement.publicPlaceNameSnapshot}</h2><p className="mt-2">{new Date(agreement.agreedEarliestStart).toLocaleString()} · {agreement.agreedDurationMinutes} minutes</p><p>{agreement.agreedPriceMinor} {agreement.currency}</p>{agreement.privateMeetingSnapshot&&<p className="mt-3 text-sm"><strong>Meeting details:</strong> {agreement.privateMeetingSnapshot}</p>}<p className="mt-3 text-xs text-gray-600">Agreement {agreement.id} · Journey {agreement.tripId}</p></section>;
}
