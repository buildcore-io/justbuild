import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("fids", (t) => {
    t.bigint("fid").primary();
  });

  await knex.schema.createTable("casts", (t) => {
    t.timestamps(true, true);
    t.timestamp("timestamp");

    t.bigint("fid");
    t.binary("hash");
    t.primary(["fid", "hash"]);

    t.bigint("parent_fid");
    t.binary("parent_hash");
    t.text("parent_url");

    t.text("text");
    t.jsonb("embeds");
    t.jsonb("mentions");
    t.jsonb("mentions_positions");
  });

  await knex.schema.createTable("reactions", (t) => {
    t.timestamps(true, true);
    t.timestamp("timestamp");
    t.timestamp("deleted_at");

    t.smallint("type");

    t.bigint("fid");
    t.binary("hash");
    t.primary(["fid", "hash"]);

    t.bigint("target_cast_fid");
    t.binary("target_cast_hash");
    t.text("target_url");
  });

  await knex.schema.createTable("user_data", (t) => {
    t.timestamps(true, true);
    t.timestamp("timestamp");
    t.timestamp("deleted_at");

    t.smallint("type");

    t.bigint("fid");
    t.binary("hash");
    t.primary(["fid", "type"]);

    t.text("value");
  });

  await knex.raw(`
    create index cast_hash_idx on casts(hash);
    create index casts_parent_url_index on casts(parent_url);
    create index casts_parent_hash_idx on casts(parent_hash);

    create index reaction_fid_target_index on reactions(fid,target_cast_fid,target_cast_hash);
    create index reactions_target_hash_idx on reactions(target_cast_fid,target_cast_hash);
    
    create index user_data_pk_index on user_data(fid,type);
  `);
}

export async function down(): Promise<void> {}
