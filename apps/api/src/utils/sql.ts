import { Prisma } from "@prisma/client";
import { env } from "@/config/env";

// Prisma's model queries are schema-qualified automatically, but hand-written
// SQL is not — so raw queries reference tables through this helper, which
// honours the `?schema=` in DATABASE_URL instead of assuming `public`.
const schema = new URL(env.databaseUrl).searchParams.get("schema") ?? "public";

export function tbl(name: string): Prisma.Sql {
  if (!/^[a-z_]+$/.test(name)) throw new Error("invalid table name");
  return Prisma.raw(`"${schema.replace(/"/g, "")}"."${name}"`);
}
