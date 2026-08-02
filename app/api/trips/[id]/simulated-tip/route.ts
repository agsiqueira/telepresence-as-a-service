import { NextResponse } from "next/server";
import { getCurrentPersistedUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { getSimulatedTipState, submitSimulatedTip } from "@/lib/simulated-tips";

const invalid=()=>NextResponse.json({error:"Invalid simulated Tip request",code:"INVALID_SIMULATED_TIP"},{status:400,headers:{"Cache-Control":"no-store"}});
const send=(result:{ok:true;value:unknown;created?:boolean}|{ok:false;error:string;code:string;status:number})=>result.ok?NextResponse.json(result.created===undefined?{tipState:result.value}:{simulatedTip:result.value,created:result.created},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error,code:result.code},{status:result.status,headers:{"Cache-Control":"no-store"}});
const authenticated=async()=>{const user=await getCurrentPersistedUser();return user?{ok:true as const,user}:{ok:false as const,response:NextResponse.json({error:"Unauthenticated"},{status:401})}};

export async function GET(_request:Request,{params}:{params:{id:string}}){const access=await authenticated();if(!access.ok)return access.response;return send(await getSimulatedTipState(db,access.user.id,params.id));}
export async function POST(request:Request,{params}:{params:{id:string}}){const access=await authenticated();if(!access.ok)return access.response;let body:unknown;try{body=await request.json()}catch{return invalid()}if(!body||typeof body!=="object"||Array.isArray(body))return invalid();const input=body as Record<string,unknown>;if(Object.keys(input).length!==1||!("amountMinor" in input))return invalid();return send(await submitSimulatedTip(db,access.user.id,params.id,{amountMinor:input.amountMinor}));}
