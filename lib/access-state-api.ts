import "server-only";

import type { User } from "@prisma/client";
import { getPersistedAccessState } from "@/lib/access-state";
import { getCurrentPersistedUser } from "@/lib/current-user";
import { db } from "@/lib/db";

type Dependencies = {
  getUser: () => Promise<Pick<User, "id"> | null>;
  getState: (userId: string) => Promise<{ role: string; accountStatus: string; updatedAt: string } | null>;
};
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export function createAccessStateHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { getUser: getCurrentPersistedUser, getState: userId => getPersistedAccessState(db, userId), ...overrides };
  return async function GET() {
    try {
      const user = await dependencies.getUser();
      if (!user) return json({ error: "Authentication is required", code: "UNAUTHORIZED" }, 401);
      const state = await dependencies.getState(user.id);
      if (!state) return json({ error: "Authentication is no longer valid", code: "UNAUTHORIZED" }, 401);
      return json(state);
    } catch (error) {
      console.error("Current access-state lookup failed", error instanceof Error ? error.name : "UnknownError");
      return json({ error: "Access state is temporarily unavailable", code: "INTERNAL_ERROR" }, 500);
    }
  };
}
