import { auth } from "@clerk/nextjs/server";
import { Role, type User } from "@prisma/client";
import { db } from "@/lib/db";

export async function getCurrentUser() {
  const { userId } = auth();
  if (!userId) return null;

  const existing = await db.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  return db.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, name: null },
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthenticated");
  }
  return user;
}

export async function requireRole(requiredRole: Role): Promise<User | null> {
  const user = await getCurrentUser();
  return user?.role === requiredRole ? user : null;
}

export async function requireAdmin(): Promise<User | null> {
  const user = await requireCurrentUser();
  return user.role === Role.ADMIN ? user : null;
}
