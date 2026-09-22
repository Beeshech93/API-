import bcrypt from "bcryptjs";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { signDeveloperToken } from "@/utils/jwt";

export async function signup(email: string, password: string, name: string) {
  const existing = await prisma.developer.findUnique({ where: { email } });
  if (existing) throw AppError.conflict("An account with that email already exists.", "EMAIL_TAKEN");

  const passwordHash = await bcrypt.hash(password, 10);
  const developer = await prisma.developer.create({
    data: { email, passwordHash, name },
  });

  const token = signDeveloperToken({ developerId: developer.id, email: developer.email });
  return { token, developer: { id: developer.id, email: developer.email, name: developer.name } };
}

export async function login(email: string, password: string) {
  const developer = await prisma.developer.findUnique({ where: { email } });
  if (!developer) throw AppError.unauthorized("Invalid email or password.", "INVALID_CREDENTIALS");

  const valid = await bcrypt.compare(password, developer.passwordHash);
  if (!valid) throw AppError.unauthorized("Invalid email or password.", "INVALID_CREDENTIALS");

  const token = signDeveloperToken({ developerId: developer.id, email: developer.email });
  return { token, developer: { id: developer.id, email: developer.email, name: developer.name } };
}
