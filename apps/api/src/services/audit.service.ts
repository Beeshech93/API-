import { Prisma } from "@prisma/client";
import { prisma } from "@/utils/prisma";

interface AuditEntry {
  action: string;
  actorUserId?: string;
  clientId?: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

// Never put secrets, tokens, passwords or full API keys in `metadata`.
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { ...entry, metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue },
    });
  } catch {
    // Audit failures must never break the request that triggered them.
  }
}
