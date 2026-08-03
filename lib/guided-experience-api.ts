import { NextResponse } from "next/server";
import { SupplyFoundationError } from "@/lib/supply-foundation";
export const guidedExperienceError=(error:unknown)=>error instanceof SupplyFoundationError?NextResponse.json({error:error.code},{status:error.status,headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:"GUIDED_EXPERIENCE_UNAVAILABLE"},{status:500,headers:{"Cache-Control":"no-store"}});
