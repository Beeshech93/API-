import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";

export async function createApplication(developerId: string, name: string) {
  return prisma.application.create({
    data: { developerId, name, feeBps: env.platformDefaultFeeBps },
  });
}

export async function listApplications(developerId: string) {
  return prisma.application.findMany({ where: { developerId }, orderBy: { createdAt: "desc" } });
}

export async function requireApplicationOwnership(applicationId: string, developerId: string) {
  const application = await prisma.application.findFirst({ where: { id: applicationId, developerId } });
  if (!application) throw AppError.notFound("Application not found.", "APPLICATION_NOT_FOUND");
  return application;
}
