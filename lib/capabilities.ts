import { AccountStatus, OperatorPilotStatus, Role, TripStatus, type OperatorProfile, type User } from "@prisma/client";

export type CapabilityUser = Pick<User, "id" | "role" | "accountStatus" | "activeTripId"> & {
  operatorProfile?: Pick<OperatorProfile, "pilotStatus"> | null;
};

export function hasAdminCapability(user: CapabilityUser) {
  return user.accountStatus === AccountStatus.ACTIVE && user.role === Role.ADMIN;
}

export function hasExplorerCapability(user: CapabilityUser) {
  return user.accountStatus === AccountStatus.ACTIVE && user.role !== Role.ADMIN;
}

export function hasTeleporterCapability(user: CapabilityUser) {
  return hasExplorerCapability(user) && user.operatorProfile?.pilotStatus === OperatorPilotStatus.APPROVED;
}

export function canInitiateTeleporterActivity(user: CapabilityUser) {
  return hasTeleporterCapability(user);
}

export function canAccessTeleporterObligation(user: CapabilityUser, trip?: { operatorId: string | null; status: TripStatus } | null) {
  if (!hasExplorerCapability(user)) return false;
  if (hasTeleporterCapability(user)) return true;
  return user.operatorProfile?.pilotStatus === OperatorPilotStatus.SUSPENDED && Boolean(
    trip && trip.operatorId === user.id && (trip.status === TripStatus.ACCEPTED || trip.status === TripStatus.IN_PROGRESS)
  );
}
