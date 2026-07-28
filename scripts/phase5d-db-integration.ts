import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { OperatorApplicationStatus, Prisma, PrismaClient, Role } from "@prisma/client";

if (process.env.PHASE5D_ACTIVE_SCHEMA !== "FULL" || process.env.PHASE5D_CONFIRM_DISPOSABLE_DATABASE !== "YES_DELETE_PHASE5D_TEST_DATA") throw new Error("Unsafe Phase 5D integration mapping");
const db = new PrismaClient();
const run = `phase5d-${randomUUID()}`;

const applicationData = (applicantId: string, suffix: string): Prisma.OperatorApplicationUncheckedCreateInput => ({
  applicantId,
  qualifications: `Phase 5D qualification ${suffix}`,
  relevantExperience: `Phase 5D experience ${suffix}`,
  languages: ["English"],
  availability: "Weekday afternoons",
});

async function main() {
  try {
    const applicant = await db.user.create({ data: { clerkId: `${run}-applicant`, role: Role.VIEWER, name: "Phase 5D applicant" } });
    const reviewer = await db.user.create({ data: { clerkId: `${run}-reviewer`, role: Role.ADMIN, name: "Phase 5D reviewer" } });

    const submissions = await Promise.allSettled([
      db.operatorApplication.create({ data: applicationData(applicant.id, "pending-a") }),
      db.operatorApplication.create({ data: applicationData(applicant.id, "pending-b") }),
    ]);
    assert.equal(submissions.filter(value => value.status === "fulfilled").length, 1, "only one pending application may be created");
    assert.equal(await db.operatorApplication.count({ where: { applicantId: applicant.id, status: OperatorApplicationStatus.PENDING } }), 1);

    const pending = await db.operatorApplication.findFirstOrThrow({ where: { applicantId: applicant.id, status: OperatorApplicationStatus.PENDING } });
    await db.operatorApplication.update({ where: { id: pending.id }, data: { status: OperatorApplicationStatus.REJECTED, reviewedById: reviewer.id, reviewedAt: new Date(), reviewNote: "Applicant-visible feedback" } });
    await db.operatorApplication.create({ data: { ...applicationData(applicant.id, "rejected-history"), status: OperatorApplicationStatus.REJECTED, reviewedById: reviewer.id, reviewedAt: new Date() } });
    await db.operatorApplication.create({ data: { ...applicationData(applicant.id, "withdrawn-history"), status: OperatorApplicationStatus.WITHDRAWN, withdrawnAt: new Date() } });
    await db.operatorApplication.create({ data: applicationData(applicant.id, "new-pending") });

    assert.equal(await db.operatorApplication.count({ where: { applicantId: applicant.id, status: OperatorApplicationStatus.REJECTED } }), 2, "terminal history must allow repeated statuses");
    assert.equal(await db.operatorApplication.count({ where: { applicantId: applicant.id, status: OperatorApplicationStatus.WITHDRAWN } }), 1);
    assert.equal(await db.operatorApplication.count({ where: { applicantId: applicant.id, status: OperatorApplicationStatus.PENDING } }), 1);
    await assert.rejects(db.user.delete({ where: { id: applicant.id } }));
    await assert.rejects(db.user.delete({ where: { id: reviewer.id } }));

    console.log("Phase 5D.1 PostgreSQL schema and index assertions passed.");
  } finally {
    await db.operatorApplication.deleteMany({ where: { applicant: { clerkId: { startsWith: run } } } });
    await db.user.deleteMany({ where: { clerkId: { startsWith: run } } });
    assert.equal(await db.operatorApplication.count({ where: { applicant: { clerkId: { startsWith: run } } } }), 0);
    assert.equal(await db.user.count({ where: { clerkId: { startsWith: run } } }), 0);
    await db.$disconnect();
  }
}

void main().catch(error => { console.error(error instanceof Error ? error.message : "Phase 5D database integration failed"); process.exitCode = 1; });
