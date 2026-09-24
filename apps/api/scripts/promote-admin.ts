import { prisma } from "../src/utils/prisma";

// Usage: npm run admin:promote --workspace @haitipay/api -- someone@example.com
// Admins are never created through the public API: promotion is an explicit,
// out-of-band operator action against the database.
const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error("Usage: admin:promote <email>");
  process.exit(1);
}

prisma.user
  .update({ where: { email }, data: { role: "ADMIN" } })
  .then((user) => console.log(`${user.email} is now an ADMIN.`))
  .catch(() => {
    console.error(`No user found with email ${email}.`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
