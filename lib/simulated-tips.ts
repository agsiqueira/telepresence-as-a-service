import "server-only";

import { AccountStatus, Prisma, PrismaClient, TripStatus } from "@prisma/client";
import { publicDisplayName } from "./profiles";
import { acquireSafetyRestrictionParticipantLocks, hasEffectiveSafetyRestrictionInTransaction } from "./safety-restriction-lock";

type Database = PrismaClient;
type Code = "INVALID_SIMULATED_TIP"|"JOURNEY_NOT_FOUND"|"JOURNEY_NOT_COMPLETED"|"SIMULATED_TIP_UNSUPPORTED"|"SIMULATED_TIP_SUBMISSION_RESTRICTED"|"SIMULATED_TIP_ALREADY_SUBMITTED"|"SIMULATED_TIP_CHANGED_CONCURRENTLY";
const failed=(status:400|404|409|503,code:Code,error:string)=>({ok:false as const,status,code,error});
export const SIMULATED_TIP_AMOUNTS = [500,1000,1500,2000] as const;
export const SIMULATED_TIP_DISCLAIMER = "This is a simulation. No money will be charged or transferred.";
const completed=(status:TripStatus)=>status===TripStatus.ENDED||status===TripStatus.FEEDBACK_COMPLETED;
const validAmount=(value:unknown):value is typeof SIMULATED_TIP_AMOUNTS[number]=>Number.isInteger(value)&&SIMULATED_TIP_AMOUNTS.includes(value as typeof SIMULATED_TIP_AMOUNTS[number]);
const receipt=(tip:{amountMinor:number;currency:string;submittedAt:Date},teleporterName:string|null,explorerName:string|null)=>({amountMinor:tip.amountMinor,currency:tip.currency,submittedAt:tip.submittedAt,recipient:{displayName:publicDisplayName(teleporterName),performedRole:"TELEPORTER" as const},submittedBy:{displayName:publicDisplayName(explorerName),performedRole:"EXPLORER" as const}});

export async function getSimulatedTipState(db:Database,actorId:string,tripId:string){
  const trip=await db.trip.findUnique({where:{id:tripId},select:{viewerId:true,operatorId:true,status:true,endedAt:true,viewer:{select:{name:true}},operator:{select:{name:true}},simulatedTip:{select:{amountMinor:true,currency:true,submittedAt:true}}}});
  if(!trip||(actorId!==trip.viewerId&&actorId!==trip.operatorId))return failed(404,"JOURNEY_NOT_FOUND","Journey not found");
  const isExplorer=actorId===trip.viewerId,supported=Boolean(completed(trip.status)&&trip.endedAt&&trip.operatorId&&trip.viewerId!==trip.operatorId);
  let submissionAllowed=false;
  if(isExplorer&&supported&&!trip.simulatedTip){
    const user=await db.user.findUnique({where:{id:actorId},select:{accountStatus:true}});
    const restricted=Boolean(await db.safetyReportRestriction.findFirst({where:{participantId:actorId,status:"ACTIVE",startsAt:{lte:new Date()},expiresAt:{gt:new Date()}},select:{id:true}}));
    submissionAllowed=user?.accountStatus===AccountStatus.ACTIVE&&!restricted;
  }
  return {ok:true as const,value:{eligible:supported,performedRole:isExplorer?"EXPLORER" as const:"TELEPORTER" as const,counterparty:{displayName:publicDisplayName(isExplorer?trip.operator?.name??null:trip.viewer.name),performedRole:isExplorer?"TELEPORTER" as const:"EXPLORER" as const},canSubmit:submissionAllowed,simulatedTip:trip.simulatedTip?receipt(trip.simulatedTip,trip.operator?.name??null,trip.viewer.name):null,disclaimer:SIMULATED_TIP_DISCLAIMER}};
}

export async function submitSimulatedTip(db:Database,actorId:string,tripId:string,input:{amountMinor?:unknown}){
  if(!validAmount(input.amountMinor))return failed(400,"INVALID_SIMULATED_TIP","Choose one of the available simulated Tip amounts");
  const amountMinor=input.amountMinor;
  try{return await db.$transaction(async tx=>{
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Trip" WHERE "id"=${tripId} FOR UPDATE`);
    const trip=await tx.trip.findUnique({where:{id:tripId},select:{viewerId:true,operatorId:true,status:true,endedAt:true,viewer:{select:{name:true,accountStatus:true}},operator:{select:{name:true}},simulatedTip:{select:{amountMinor:true,currency:true,submittedAt:true}}}});
    if(!trip||trip.viewerId!==actorId)return failed(404,"JOURNEY_NOT_FOUND","Journey not found");
    if(!completed(trip.status))return failed(409,"JOURNEY_NOT_COMPLETED","Journey has not been completed");
    if(!trip.operatorId||trip.viewerId===trip.operatorId||!trip.endedAt)return failed(409,"SIMULATED_TIP_UNSUPPORTED","Journey does not support simulated Tips");
    if(trip.simulatedTip)return trip.simulatedTip.amountMinor===amountMinor?{ok:true as const,value:receipt(trip.simulatedTip,trip.operator?.name??null,trip.viewer.name),created:false}:failed(409,"SIMULATED_TIP_ALREADY_SUBMITTED","A different simulated Tip has already been submitted for this Journey");
    await acquireSafetyRestrictionParticipantLocks(tx,[actorId]);
    if(trip.viewer.accountStatus!==AccountStatus.ACTIVE||await hasEffectiveSafetyRestrictionInTransaction(tx,[actorId]))return failed(409,"SIMULATED_TIP_SUBMISSION_RESTRICTED","New simulated Tip submission is unavailable");
    const created=await tx.simulatedTip.create({data:{tripId,explorerId:trip.viewerId,teleporterId:trip.operatorId,amountMinor,currency:"USD"},select:{amountMinor:true,currency:true,submittedAt:true}});
    return {ok:true as const,value:receipt(created,trip.operator?.name??null,trip.viewer.name),created:true};
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})}catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2034")return failed(503,"SIMULATED_TIP_CHANGED_CONCURRENTLY","Simulated Tip state changed concurrently; try again");
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")return failed(503,"SIMULATED_TIP_CHANGED_CONCURRENTLY","Simulated Tip state changed concurrently; try again");
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2004")return failed(409,"SIMULATED_TIP_UNSUPPORTED","Journey does not support simulated Tips");
    throw error;
  }
}
