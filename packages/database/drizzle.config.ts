import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations/generated",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://synesis:synesis@localhost:5432/synesis",
  },
  strict: true,
  verbose: true,
});
