const { Knex } = require("knex");

const {
  KnexDataSource
} = require('@dbos-inc/knex-datasource');

exports.up = async function (knex) {
  await knex.schema.createTable("dbos_greetings", (table) => {
    table.text("greeting_name");
    table.text("greeting_note_content");
  });

  await KnexDataSource.initializeSchema(knex);
};

exports.down = async function (knex) {
  await knex.schema.dropTable("dbos_greetings");

  await KnexDataSource.uninitializeSchema(knex);
};
