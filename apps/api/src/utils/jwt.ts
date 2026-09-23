import jwt from "jsonwebtoken";
import { env } from "@/config/env";

export interface AccessTokenPayload {
  sub: string;
  clientId: string;
  role: "USER" | "ADMIN";
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.accessTtlSeconds, algorithm: "HS256" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.secret, { algorithms: ["HS256"] }) as unknown as AccessTokenPayload;
}
