import { NextResponse } from "next/server";
import { authorizeApiUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { getJourneyReviewContext, REVIEW_REPUTATION_DEFAULT_LIMIT, REVIEW_REPUTATION_MAX_LIMIT, submitJourneyReview } from "@/lib/journey-reviews";

const send=(result:{ok:true;value:unknown}|{ok:false;error:string;code:string;status:number})=>result.ok?NextResponse.json({review:result.value}):NextResponse.json({error:result.error,code:result.code},{status:result.status});
const invalid=()=>NextResponse.json({error:"Invalid review request",code:"INVALID_REVIEW"},{status:400});

export async function GET(request:Request,{params}:{params:{id:string}}){
  const access=await authorizeApiUser();if(!access.ok)return access.response;
  const search=new URL(request.url).searchParams;
  if([...search.keys()].some(key=>key!=="cursor"&&key!=="limit")||search.getAll("cursor").length>1||search.getAll("limit").length>1)return NextResponse.json({error:"Invalid reputation pagination",code:"INVALID_REPUTATION_CURSOR"},{status:400});
  const rawLimit=search.get("limit");
  if(rawLimit!==null&&!/^[1-9]\d*$/.test(rawLimit))return NextResponse.json({error:"Invalid reputation pagination",code:"INVALID_REPUTATION_CURSOR"},{status:400});
  const limit=rawLimit===null?REVIEW_REPUTATION_DEFAULT_LIMIT:Number(rawLimit);
  if(!Number.isSafeInteger(limit)||limit>REVIEW_REPUTATION_MAX_LIMIT)return NextResponse.json({error:"Invalid reputation pagination",code:"INVALID_REPUTATION_CURSOR"},{status:400});
  return send(await getJourneyReviewContext(db,access.user.id,params.id,search.get("cursor")??undefined,limit));
}

export async function POST(request:Request,{params}:{params:{id:string}}){
  const access=await authorizeApiUser();if(!access.ok)return access.response;
  let body:unknown;try{body=await request.json()}catch{return invalid()}
  if(!body||typeof body!=="object"||Array.isArray(body))return invalid();
  const input=body as Record<string,unknown>,keys=Object.keys(input);
  if(!keys.includes("rating")||keys.some(key=>key!=="rating"&&key!=="comment"))return invalid();
  return send(await submitJourneyReview(db,access.user.id,params.id,{rating:input.rating,...(keys.includes("comment")?{comment:input.comment}:{})}));
}
