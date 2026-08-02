import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { JourneyReviewRole, PrismaClient, Role, TripStatus } from "@prisma/client";
import { endTrip } from "../lib/trip-lifecycle";
import { getJourneyReviewState, getRoleReputation, submitJourneyReview } from "../lib/journey-reviews";

if(!process.env.PHASE3_TEST_DATABASE_URL||!process.env.PHASE4_TEST_DATABASE_URL||process.env.PHASE3_TEST_DATABASE_URL!==process.env.PHASE4_TEST_DATABASE_URL||process.env.DATABASE_URL!==process.env.PHASE3_TEST_DATABASE_URL)throw new Error("Unsafe database mapping");
const db=new PrismaClient(),run=`p5d1-hardening-${randomUUID()}`;
async function user(name:string,role:Role){return db.user.create({data:{clerkId:`${run}-${randomUUID()}`,name,role}})}
async function completed(viewerId:string,operatorId:string){const trip=await db.trip.create({data:{viewerId,operatorId,destination:"Review integrity",livekitRoom:`${run}-${randomUUID()}`,status:TripStatus.IN_PROGRESS,startedAt:new Date()}}),ended=await endTrip(db,operatorId,Role.OPERATOR,trip.id,new Date());assert.equal(ended.ok,true);return db.trip.findUniqueOrThrow({where:{id:trip.id}})}
async function rejects(work:Promise<unknown>){await assert.rejects(work)}
async function main(){
 const viewer=await user("Explorer",Role.VIEWER),operator=await user("Teleporter",Role.OPERATOR),stranger=await user("Stranger",Role.VIEWER),trip=await completed(viewer.id,operator.id);
 await submitJourneyReview(db,viewer.id,trip.id,{rating:5,comment:"Valid Explorer review"});
 await submitJourneyReview(db,operator.id,trip.id,{rating:4,comment:"Valid Teleporter review"});
 assert.equal((await getJourneyReviewState(db,viewer.id,trip.id)).ok,true);
 console.log("PASS valid bilateral attribution and reveal remain supported");

 const direct={tripId:trip.id,reviewerId:stranger.id,revieweeId:operator.id,reviewerRole:JourneyReviewRole.EXPLORER,revieweeRole:JourneyReviewRole.TELEPORTER,rating:3};
 await rejects(db.journeyReview.create({data:{...direct}}));
 const second=await completed(await user("Explorer two",Role.VIEWER).then(x=>x.id),operator.id);
 await rejects(db.journeyReview.create({data:{tripId:second.id,reviewerId:operator.id,revieweeId:second.viewerId,reviewerRole:JourneyReviewRole.EXPLORER,revieweeRole:JourneyReviewRole.TELEPORTER,rating:3}}));
 await rejects(db.journeyReview.create({data:{tripId:second.id,reviewerId:second.viewerId,revieweeId:second.viewerId,reviewerRole:JourneyReviewRole.EXPLORER,revieweeRole:JourneyReviewRole.TELEPORTER,rating:3}}));
 await rejects(db.journeyReview.create({data:{tripId:second.id,reviewerId:second.viewerId,revieweeId:operator.id,reviewerRole:JourneyReviewRole.TELEPORTER,revieweeRole:JourneyReviewRole.EXPLORER,rating:3}}));
 const incomplete=await db.trip.create({data:{viewerId:viewer.id,operatorId:operator.id,destination:"Incomplete",livekitRoom:`${run}-${randomUUID()}`,status:TripStatus.ACCEPTED}});
 await rejects(db.journeyReview.create({data:{tripId:incomplete.id,reviewerId:viewer.id,revieweeId:operator.id,reviewerRole:JourneyReviewRole.EXPLORER,revieweeRole:JourneyReviewRole.TELEPORTER,rating:3}}));
 const cancelled=await db.trip.create({data:{viewerId:viewer.id,operatorId:operator.id,destination:"Cancelled",livekitRoom:`${run}-${randomUUID()}`,status:TripStatus.CANCELLED}});
 await rejects(db.journeyReview.create({data:{tripId:cancelled.id,reviewerId:viewer.id,revieweeId:operator.id,reviewerRole:JourneyReviewRole.EXPLORER,revieweeRole:JourneyReviewRole.TELEPORTER,rating:3}}));
 console.log("PASS PostgreSQL rejects unrelated, swapped, same-party, wrong-role, incomplete, and cancelled direct writes");

 await rejects(db.trip.update({where:{id:trip.id},data:{viewerId:stranger.id}}));
 await rejects(db.trip.update({where:{id:trip.id},data:{operatorId:stranger.id}}));
 await rejects(db.trip.update({where:{id:trip.id},data:{status:TripStatus.IN_PROGRESS}}));
 await rejects(db.trip.update({where:{id:trip.id},data:{endedAt:new Date()}}));
 await rejects(db.trip.update({where:{id:trip.id},data:{reviewDeadlineAt:new Date(trip.reviewDeadlineAt!.getTime()+1)}}));
 await rejects(db.trip.update({where:{id:trip.id},data:{reviewDeadlineAt:null}}));
 await db.trip.update({where:{id:trip.id},data:{viewerId:trip.viewerId,operatorId:trip.operatorId,status:trip.status,endedAt:trip.endedAt,reviewDeadlineAt:trip.reviewDeadlineAt,destination:"Permitted historical label"}});
 console.log("PASS completed authority fields are immutable while same values and unrelated fields remain writable");

 await db.user.update({where:{id:viewer.id},data:{role:Role.OPERATOR}});
 const stored=await db.journeyReview.findFirstOrThrow({where:{tripId:trip.id,reviewerId:viewer.id}});
 assert.equal(stored.reviewerRole,JourneyReviewRole.EXPLORER);
 console.log("PASS later account-role change does not alter performed-role attribution");

 const hiddenViewer=await user("Hidden Explorer",Role.VIEWER),hiddenTrip=await completed(hiddenViewer.id,operator.id);
 await submitJourneyReview(db,hiddenViewer.id,hiddenTrip.id,{rating:1,comment:"Hidden"});
 const before=await getRoleReputation(db,operator.id,JourneyReviewRole.TELEPORTER,undefined,1);
 assert.equal(before.comments.some(x=>x.comment==="Hidden"),false);
 const tiedSubmittedAt=new Date();
 for(let index=0;index<3;index++){const v=await user(`Page Explorer ${index}`,Role.VIEWER),t=await completed(v.id,operator.id);await db.journeyReview.create({data:{tripId:t.id,reviewerId:v.id,revieweeId:operator.id,reviewerRole:JourneyReviewRole.EXPLORER,revieweeRole:JourneyReviewRole.TELEPORTER,rating:index+2,comment:`Page ${index}`,submittedAt:tiedSubmittedAt}});await db.journeyReview.create({data:{tripId:t.id,reviewerId:operator.id,revieweeId:v.id,reviewerRole:JourneyReviewRole.TELEPORTER,revieweeRole:JourneyReviewRole.EXPLORER,rating:5,submittedAt:tiedSubmittedAt}})}
 const first=await getRoleReputation(db,operator.id,JourneyReviewRole.TELEPORTER,undefined,2);assert.equal(first.comments.length,2);assert.ok(first.nextCursor);
 const next=await getRoleReputation(db,operator.id,JourneyReviewRole.TELEPORTER,first.nextCursor!,2);assert.equal(new Set([...first.comments,...next.comments].map(x=>`${x.submittedAt.toISOString()}-${x.comment}`)).size,first.comments.length+next.comments.length);
 await assert.rejects(getRoleReputation(db,operator.id,JourneyReviewRole.TELEPORTER,"malformed",2));
 await assert.rejects(getRoleReputation(db,viewer.id,JourneyReviewRole.TELEPORTER,first.nextCursor!,2));
 await assert.rejects(getRoleReputation(db,operator.id,JourneyReviewRole.EXPLORER,first.nextCursor!,2));
 await assert.rejects(getRoleReputation(db,operator.id,JourneyReviewRole.TELEPORTER,undefined,0));
 await assert.rejects(getRoleReputation(db,operator.id,JourneyReviewRole.TELEPORTER,undefined,51));
 assert.equal((await getRoleReputation(db,operator.id,JourneyReviewRole.EXPLORER)).count,0);
 console.log("PASS bounded stable pagination with tied timestamps, strict context-bound cursors, hidden exclusion, and separate role reputation");

 const duplicateTrip=await completed(await user("Concurrent Explorer",Role.VIEWER).then(x=>x.id),operator.id);
 const duplicates=await Promise.allSettled([submitJourneyReview(db,duplicateTrip.viewerId,duplicateTrip.id,{rating:5}),submitJourneyReview(db,duplicateTrip.viewerId,duplicateTrip.id,{rating:5})]);
 assert.equal(await db.journeyReview.count({where:{tripId:duplicateTrip.id,reviewerId:duplicateTrip.viewerId}}),1);
 assert.ok(duplicates.every(x=>x.status==="fulfilled"&&x.value.ok));
 console.log("PASS concurrent identical retry creates exactly one immutable review");

 const retryTrip=await completed(await user("Retry Explorer",Role.VIEWER).then(x=>x.id),operator.id);
 const original=await submitJourneyReview(db,retryTrip.viewerId,retryTrip.id,{rating:5,comment:"Same"});
 const same=await submitJourneyReview(db,retryTrip.viewerId,retryTrip.id,{rating:5,comment:"Same"});
 const changed=await submitJourneyReview(db,retryTrip.viewerId,retryTrip.id,{rating:4,comment:"Changed"});
 assert.equal(original.ok&&original.created,true);assert.equal(same.ok&&same.created,false);assert.equal(changed.ok,false);if(!changed.ok)assert.equal(changed.code,"REVIEW_ALREADY_SUBMITTED");
 const bilateralTrip=await completed(await user("Bilateral Explorer",Role.VIEWER).then(x=>x.id),operator.id);
 const bilateral=await Promise.all([submitJourneyReview(db,bilateralTrip.viewerId,bilateralTrip.id,{rating:5}),submitJourneyReview(db,operator.id,bilateralTrip.id,{rating:4})]);
 for(let index=0;index<bilateral.length;index++){const result=bilateral[index];if(!result.ok){assert.equal(result.code,"REVIEW_CHANGED_CONCURRENTLY");const actor=index===0?bilateralTrip.viewerId:operator.id,rating=index===0?5:4;assert.equal((await submitJourneyReview(db,actor,bilateralTrip.id,{rating})).ok,true)}}
 assert.equal(await db.journeyReview.count({where:{tripId:bilateralTrip.id}}),2);const revealed=await getJourneyReviewState(db,bilateralTrip.viewerId,bilateralTrip.id);assert.equal(revealed.ok&&revealed.value.revealedReviews.length,2);
 console.log("PASS changed retry conflicts and simultaneous bilateral submissions follow bounded retry then reveal exactly two reviews together");
}

main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 let deleteTriggerDisabled=false;
 try{
  await db.$executeRawUnsafe('ALTER TABLE "JourneyReview" DISABLE TRIGGER "JourneyReview_prevent_delete"');
  deleteTriggerDisabled=true;
  await db.journeyReview.deleteMany({where:{trip:{viewer:{clerkId:{startsWith:run}}}}});
 }finally{
  if(deleteTriggerDisabled)await db.$executeRawUnsafe('ALTER TABLE "JourneyReview" ENABLE TRIGGER "JourneyReview_prevent_delete"');
 }
 try{
  await db.tripOffer.deleteMany({where:{trip:{viewer:{clerkId:{startsWith:run}}}}});
  await db.trip.deleteMany({where:{viewer:{clerkId:{startsWith:run}}}});
  await db.user.deleteMany({where:{clerkId:{startsWith:run}}});
 }finally{await db.$disconnect()}
});
