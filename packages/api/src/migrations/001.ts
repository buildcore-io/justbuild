import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("blocked_fids", (t) => {
    t.timestamps(true, true);
    t.string("channel_id");
    t.bigint("fid");
    t.bigint("target_fid")

    t.primary(["channel_id", "target_fid"]);
  });

  await knex.raw(`
    create index blocked_fids_channel_id on blocked_fids(channel_id);
  `);
}

export async function down(): Promise<void> {}
