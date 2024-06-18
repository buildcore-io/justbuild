import Knex from "knex";

export const database = Knex({
  client: "pg",
  connection: {
    user: process.env.DB_USER,
    password: process.env.DB_PWD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
  },
});
