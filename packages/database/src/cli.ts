import { migrate, rollback, seedDevelopmentFixtures } from "./migrations.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const command = process.argv[2];

switch (command) {
  case "migrate": {
    const applied = await migrate({ connectionString });
    console.info(
      applied.length === 0
        ? "Database is current"
        : `Applied: ${applied.join(", ")}`,
    );
    break;
  }
  case "rollback": {
    const reverted = await rollback({ connectionString, steps: "all" });
    console.info(
      reverted.length === 0
        ? "Nothing to roll back"
        : `Reverted: ${reverted.join(", ")}`,
    );
    break;
  }
  case "seed": {
    const mode = process.env.SYNESIS_MODE;
    if (mode !== "demo" && mode !== "live") {
      throw new Error("SYNESIS_MODE must be demo or live");
    }
    await seedDevelopmentFixtures({ connectionString, mode });
    console.info("Development fixtures loaded");
    break;
  }
  default:
    throw new Error("Usage: cli.ts <migrate|rollback|seed>");
}
