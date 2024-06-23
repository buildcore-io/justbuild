import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("channels", (t) => {
    t.string("channel_id").primary();
    t.specificType("banned", "integer[]").defaultTo("{}");
    t.specificType("hosts", "integer[]").defaultTo("{}");
  });
}

export async function down(): Promise<void> {}
