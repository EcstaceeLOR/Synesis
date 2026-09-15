import { readFile } from "node:fs/promises";

import pg from "pg";

const { Pool } = pg;

const migrations = [
  {
    id: "0000_initial",
    up: new URL("../migrations/0000_initial.up.sql", import.meta.url),
    down: new URL("../migrations/0000_initial.down.sql", import.meta.url),
  },
  {
    id: "0001_durable_coordinator",
    up: new URL(
      "../migrations/0001_durable_coordinator.up.sql",
      import.meta.url,
    ),
    down: new URL(
      "../migrations/0001_durable_coordinator.down.sql",
      import.meta.url,
    ),
  },
  {
    id: "0002_auth_rbac",
    up: new URL("../migrations/0002_auth_rbac.up.sql", import.meta.url),
    down: new URL("../migrations/0002_auth_rbac.down.sql", import.meta.url),
  },
  {
    id: "0003_integration_onboarding",
    up: new URL(
      "../migrations/0003_integration_onboarding.up.sql",
      import.meta.url,
    ),
    down: new URL(
      "../migrations/0003_integration_onboarding.down.sql",
      import.meta.url,
    ),
  },
  {
    id: "0004_frozen_mech_selections",
    up: new URL(
      "../migrations/0004_frozen_mech_selections.up.sql",
      import.meta.url,
    ),
    down: new URL(
      "../migrations/0004_frozen_mech_selections.down.sql",
      import.meta.url,
    ),
  },
  {
    id: "0005_olas_procurement_uniqueness",
    up: new URL(
      "../migrations/0005_olas_procurement_uniqueness.up.sql",
      import.meta.url,
    ),
    down: new URL(
      "../migrations/0005_olas_procurement_uniqueness.down.sql",
      import.meta.url,
    ),
  },
] as const;

export interface MigrationOptions {
  readonly connectionString: string;
}

export interface RollbackOptions extends MigrationOptions {
  readonly steps?: number | "all";
}

const withMigrationTransaction = async <T>(
  connectionString: string,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('synesis_migrations'))",
    );
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

const ensureJournal = (client: pg.PoolClient): Promise<pg.QueryResult> =>
  client.query(`
    CREATE TABLE IF NOT EXISTS _synesis_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

export const migrate = async ({
  connectionString,
}: MigrationOptions): Promise<readonly string[]> =>
  withMigrationTransaction(connectionString, async (client) => {
    await ensureJournal(client);
    const applied = await client.query<{ id: string }>(
      "SELECT id FROM _synesis_migrations",
    );
    const appliedIds = new Set(applied.rows.map((row) => row.id));
    const completed: string[] = [];

    for (const migration of migrations) {
      if (appliedIds.has(migration.id)) continue;
      await client.query(await readFile(migration.up, "utf8"));
      await client.query("INSERT INTO _synesis_migrations (id) VALUES ($1)", [
        migration.id,
      ]);
      completed.push(migration.id);
    }

    return completed;
  });

export const rollback = async ({
  connectionString,
  steps = 1,
}: RollbackOptions): Promise<readonly string[]> =>
  withMigrationTransaction(connectionString, async (client) => {
    await ensureJournal(client);
    const applied = await client.query<{ id: string }>(
      "SELECT id FROM _synesis_migrations ORDER BY applied_at DESC, id DESC",
    );
    const count = steps === "all" ? applied.rows.length : steps;
    const selected = applied.rows.slice(0, count);
    const completed: string[] = [];

    for (const row of selected) {
      const migration = migrations.find((candidate) => candidate.id === row.id);
      if (!migration)
        throw new Error(`No down migration registered for ${row.id}`);
      await client.query(await readFile(migration.down, "utf8"));
      await client.query("DELETE FROM _synesis_migrations WHERE id = $1", [
        row.id,
      ]);
      completed.push(row.id);
    }

    const remaining = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM _synesis_migrations",
    );
    if (remaining.rows[0]?.count === "0") {
      await client.query("DROP TABLE _synesis_migrations");
    }

    return completed;
  });

export interface DevelopmentSeedOptions extends MigrationOptions {
  readonly mode: "demo" | "live";
}

export const seedDevelopmentFixtures = async ({
  connectionString,
  mode,
}: DevelopmentSeedOptions): Promise<void> => {
  if (mode === "live") {
    throw new Error("Development fixtures cannot be loaded in live mode");
  }

  await withMigrationTransaction(connectionString, async (client) => {
    await client.query(
      await readFile(
        new URL("../migrations/development/seed.sql", import.meta.url),
        "utf8",
      ),
    );
  });
};
