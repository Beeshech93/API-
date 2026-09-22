import jwt from "jsonwebtoken";
import { env } from "@/config/env";

export interface DeveloperTokenPayload {
  developerId: string;
  email: string;
}

export function signDeveloperToken(payload: DeveloperTokenPayload): string {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn } as jwt.SignOptions);
}

export function verifyDeveloperToken(token: string): DeveloperTokenPayload {
  return jwt.verify(token, env.jwt.secret) as DeveloperTokenPayload;
}
