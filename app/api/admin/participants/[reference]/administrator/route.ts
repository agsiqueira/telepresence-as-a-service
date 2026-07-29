import { createAdministratorGovernanceHandler } from "@/lib/administrator-governance-api";

export const POST = createAdministratorGovernanceHandler("assign-administrator");
export const DELETE = createAdministratorGovernanceHandler("remove-administrator");
