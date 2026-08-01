import { NextResponse } from "next/server";
import { authorizeApiUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { getJourneyReviewState, submitJourneyReview } from "@/lib/journey-reviews";

const response=(result:Awaited<ReturnType<typeof getJourneyReviewState>>|Awaited<ReturnType<typeof submitJourneyReview>>)=>result.ok?NextResponse.json({review:result.value}):NextResponse.json({error:result.error,code:result.code},{status:result.status});
export async function GET(_request:Request,{params}:{params:{id:string}}){const access=await authorizeApiUser();if(!access.ok)return access.response;return response(await getJourneyReviewState(db,access.user.id,params.id))}
export async function POST(request:Request,{params}:{params:{id:string}}){const access=await authorizeApiUser();if(!access.ok)return access.response;let body:unknown;try{body=await request.json()}catch{return NextResponse.json({error:"Invalid review",code:"INVALID_REVIEW"},{status:400})}const input=body&&typeof body==="object"?body as Record<string,unknown>:{};return response(await submitJourneyReview(db,access.user.id,params.id,{rating:input.rating,comment:input.comment}))}
