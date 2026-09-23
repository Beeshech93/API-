import { ensureDefaults } from "../src/services/bootstrap.service";
import { prisma } from "../src/utils/prisma";

ensureDefaults()
  .then(() => console.log("Defaults ensured (plans, providers, fee settings)."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
