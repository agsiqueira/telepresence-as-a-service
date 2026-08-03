import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Role, SupplyCapacityClaimStatus, SupplyStatus, SupplyType } from "@prisma/client";
const db=new PrismaClient(),run=`p6-${randomUUID()}`,pass=(s:string)=>console.log(`PASS ${s}`);
async function user(name:string){return db.user.create({data:{clerkId:`${run}-${randomUUID()}`,name,role:Role.VIEWER}})}
async function live(teleporterId:string,start:Date,end:Date,capacity=1){return db.supplyListing.create({data:{teleporterId,type:SupplyType.LIVE_MOMENT,status:SupplyStatus.PUBLISHED,publicPlaceName:"Public museum",coarseLocation:"Downtown",durationMinutes:30,priceMinor:2500,currency:"USD",capacity,publishedAt:new Date(),liveMoment:{create:{availabilityStart:start,availabilityEnd:end,expiresAt:end}}},include:{liveMoment:true}})}
async function claim(listing:{id:string,teleporterId:string,liveMoment:{id:string}|null},explorerId:string,startAt:Date){return db.supplyCapacityClaim.create({data:{listingId:listing.id,teleporterId:listing.teleporterId,liveMomentId:listing.liveMoment!.id,explorerId,startAt,endAt:new Date(startAt.getTime()+1800000),expiresAt:new Date(0)}})}
async function main(){
 const explorer=await user("Explorer"),teleporter=await user("Teleporter"),other=await user("Other"),start=new Date(Date.now()+3600000),end=new Date(start.getTime()+4*3600000),listing=await live(teleporter.id,start,end,4);
 assert.equal(listing.liveMoment?.listingId,listing.id);pass("valid mode-specific supply creation preserves authoritative owner and terms");
 await assert.rejects(db.supplyListing.create({data:{teleporterId:teleporter.id,type:SupplyType.LIVE_MOMENT,publicPlaceName:"x",coarseLocation:"y",durationMinutes:0,priceMinor:1,currency:"USD",capacity:1}}));
 await assert.rejects(db.supplyListing.create({data:{teleporterId:teleporter.id,type:SupplyType.LIVE_MOMENT,publicPlaceName:"x",coarseLocation:"y",durationMinutes:1,priceMinor:0,currency:"usd",capacity:0}}));pass("invalid commercial and duration authority is rejected");
 await assert.rejects(db.guidedExperience.create({data:{listingId:listing.id,title:"Bad",description:"Still invalid because the listing has the wrong supply type."}}));
 await assert.rejects(db.liveMoment.update({where:{id:listing.liveMoment!.id},data:{availabilityEnd:new Date(end.getTime()+1)}}));
 await assert.rejects(db.supplyListing.update({where:{id:listing.id},data:{teleporterId:other.id}}));pass("mode mismatch and ownership/window rewrites are rejected");
 const first=await claim(listing,explorer.id,start);assert.equal(first.expiresAt.getTime()-first.createdAt.getTime(),600000);pass("database clock creates an exact ten-minute claim");
 await assert.rejects(claim(listing,explorer.id,start));await assert.rejects(claim(listing,other.id,start));pass("same-target duplication and overlapping Teleporter claims are rejected");
 await db.supplyCapacityClaim.update({where:{id:first.id},data:{status:SupplyCapacityClaimStatus.RELEASED,releasedAt:new Date()}});const next=await claim(listing,other.id,start);assert.equal(next.status,SupplyCapacityClaimStatus.HELD);pass("released claims stop consuming capacity and remain historical");
 const targets=[];for(let i=0;i<4;i++)targets.push(await live(teleporter.id,new Date(end.getTime()+(i+1)*3600000),new Date(end.getTime()+(i+2)*3600000)));
 for(let i=0;i<3;i++)await claim(targets[i],explorer.id,targets[i].liveMoment!.availabilityStart);
 await assert.rejects(claim(targets[3],explorer.id,targets[3].liveMoment!.availabilityStart));pass("three active claims globally are enforced transactionally");
 const concurrentListing=await live(teleporter.id,new Date(end.getTime()+8*3600000),new Date(end.getTime()+10*3600000)),a=new PrismaClient(),b=new PrismaClient();
 const outcomes=await Promise.allSettled([claimWith(a,concurrentListing,explorer.id,concurrentListing.liveMoment!.availabilityStart),claimWith(b,concurrentListing,other.id,concurrentListing.liveMoment!.availabilityStart)]);assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);await a.$disconnect();await b.$disconnect();pass("independent concurrent clients cannot oversubscribe an interval");
 const migration=await db.$queryRaw<Array<{migration_name:string;finished_at:Date|null}>>`SELECT migration_name,finished_at FROM _prisma_migrations WHERE migration_name='20260803010000_phase6_supply_foundation'`;assert.equal(migration.length,1);assert.ok(migration[0].finished_at);pass("Phase 6 foundation migration is installed successfully");
}
async function claimWith(client:PrismaClient,listing:{id:string;teleporterId:string;liveMoment:{id:string}|null},explorerId:string,startAt:Date){return client.supplyCapacityClaim.create({data:{listingId:listing.id,teleporterId:listing.teleporterId,liveMomentId:listing.liveMoment!.id,explorerId,startAt,endAt:new Date(startAt.getTime()+1800000),expiresAt:new Date(0)}})}
main().finally(()=>db.$disconnect());
