"use client";

import { useCallback, useEffect, useState } from "react";
import JourneyReschedulingPanel from "@/components/JourneyReschedulingPanel";
import { Button, MetadataList, Notice, Skeleton, StatePanel, StatusBadge, Surface } from "@/components/ui/primitives";

export type AgreementView={id:string;tripId:string;proposalId:string;agreedStartAt:string|null;agreedEarliestStart:string;agreedLatestStart:string|null;agreedDurationMinutes:number;agreedPriceMinor:number;currency:string;publicPlaceNameSnapshot:string;coarseLocationSnapshot:string;privateMeetingSnapshot:string|null;status:string;confirmedAt:string};

export default function AgreementConfirmation({requestId,refresh=0,embedded=false}:{requestId:string;refresh?:number;embedded?:boolean}){
  const[agreement,setAgreement]=useState<AgreementView|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=useCallback(async()=>{setError("");try{const response=await fetch(`/api/journey-requests/${requestId}/agreement`,{cache:"no-store"});if(response.status===404){setAgreement(null);return}const data=await response.json();if(!response.ok)throw new Error(data.error??"Unable to load Agreement");setAgreement(data.agreement)}catch(value){setError(value instanceof Error?value.message:"Unable to load Agreement")}finally{setLoading(false)}},[requestId]);
  useEffect(()=>{void load()},[load,refresh]);
  if(loading)return <Surface aria-busy="true"><Skeleton className="w-1/3"/><Skeleton className="mt-3 w-2/3"/><span className="sr-only" role="status">Loading Agreement…</span></Surface>;
  if(error&&!agreement)return <StatePanel title="Agreement could not be loaded" tone="danger" action={<Button variant="secondary" onClick={()=>void load()}>Retry Agreement for this Request</Button>}><p>Request and Proposal information remains available.</p></StatePanel>;
  if(!agreement)return <StatePanel title="No Agreement yet"><p>An Agreement appears only after an eligible Proposal is accepted.</p></StatePanel>;
  const timing=agreement.agreedStartAt?new Date(agreement.agreedStartAt).toLocaleString():agreement.agreedLatestStart?`${new Date(agreement.agreedEarliestStart).toLocaleString()} – ${new Date(agreement.agreedLatestStart).toLocaleString()}`:new Date(agreement.agreedEarliestStart).toLocaleString();
  const content=<Surface className="border-success-fg/30 bg-success-bg"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-label uppercase tracking-wide text-success-fg">Confirmed scheduled Journey</p><h2 className="mt-1 text-heading-2">{agreement.publicPlaceNameSnapshot}</h2></div><StatusBadge variant="success">Agreement confirmed</StatusBadge></div><MetadataList className="mt-4" items={[{term:"Schedule",detail:timing},{term:"Duration",detail:`${agreement.agreedDurationMinutes} minutes`},{term:"Location",detail:agreement.coarseLocationSnapshot},{term:"Meeting details",detail:agreement.privateMeetingSnapshot||"None provided"}]}/><Notice className="mt-5" variant="info" title="Portal access"><p>Portal availability is determined by the current Journey state. This confirmed schedule does not guarantee that the Portal is open yet.</p></Notice><JourneyReschedulingPanel tripId={agreement.tripId} onRefresh={load}/>{error&&<Notice className="mt-4" variant="danger" title="Agreement refresh failed"><p>{error}</p></Notice>}</Surface>;
  return embedded?<section className="mb-6" aria-label="Agreement and confirmed schedule">{content}</section>:content;
}
