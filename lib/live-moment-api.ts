import { NextResponse } from "next/server";
import { SupplyFoundationError } from "@/lib/supply-foundation";
export const liveMomentError=(error:unknown)=>error instanceof SupplyFoundationError?NextResponse.json({error:error.code},{status:error.status}):NextResponse.json({error:"LIVE_MOMENT_UNAVAILABLE"},{status:500});
