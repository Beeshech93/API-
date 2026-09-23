import { ApiEnvironment } from "@prisma/client";
import { prisma } from "@/utils/prisma";

interface ApiLogEntry {
  requestId: string;
  clientId?: string;
  apiKeyId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseMs: number;
  ip?: string;
  provider?: string;
  environment?: ApiEnvironment;
}

// Logs metadata only (who/what/when/how long). Request and response bodies,
// headers and query strings are deliberately never stored, so no secret,
// password, PIN or token can end up in the logs.
export async function writeApiLog(entry: ApiLogEntry): Promise<void> {
  try {
    await prisma.apiLog.create({ data: entry });
  } catch {
    // Logging must never fail a request.
  }
}
