import { NextResponse } from "next/server";
import { authorizeApiUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { submitSafetyReport } from "@/lib/safety-reports";

export async function POST(request:Request,{params}:{params:{id:string}}){const access=await authorizeApiUser();if(!access.ok)return access.response;let body:unknown;try{body=await request.json()}catch{return NextResponse.json({error:"Invalid safety report",code:"INVALID_SAFETY_REPORT"},{status:400})}if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(key=>!["category","severity","narrative"].includes(key)))return NextResponse.json({error:"Invalid safety report",code:"INVALID_SAFETY_REPORT"},{status:400});const input=body as Record<string,unknown>,result=await submitSafetyReport(db,access.user.id,params.id,{category:input.category,severity:input.severity,narrative:input.narrative});return result.ok?NextResponse.json({report:result.value},{status:201,headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error,code:result.code},{status:result.status,headers:{"Cache-Control":"no-store"}})}
