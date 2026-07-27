import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
// These authenticated bootstrap APIs enforce identity in their handlers so they can
// always return JSON (including 401/503) instead of Clerk's HTML middleware response.
const isViewerBootstrapApi = createRouteMatcher([
  "/api/destinations",
  "/api/trips/current",
  "/api/trips/history",
]);

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req) && !isViewerBootstrapApi(req)) {
    auth().protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
