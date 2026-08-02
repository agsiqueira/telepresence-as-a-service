import{NextResponse}from"next/server";import{db}from"@/lib/db";import{authorizeExplorerApi}from"@/lib/current-user";import{discoverLiveMoments}from"@/lib/live-moments";
export async function GET(){const a=await authorizeExplorerApi();if(!a.ok)return a.response;return NextResponse.json({liveMoments:await discoverLiveMoments(db)},{headers:{"Cache-Control":"no-store"}})}
