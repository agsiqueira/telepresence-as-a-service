import{NextResponse}from"next/server";import{db}from"@/lib/db";import{authorizeExplorerApi}from"@/lib/current-user";import{getExplorerLiveMomentClaims}from"@/lib/live-moments";
export async function GET(){const a=await authorizeExplorerApi();if(!a.ok)return a.response;return NextResponse.json({claims:await getExplorerLiveMomentClaims(db,a.user.id)},{headers:{"Cache-Control":"no-store"}})}
