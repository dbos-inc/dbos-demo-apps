const { Knex } = require("knex");

exports.up = async function (knex) {
  await knex.schema.createTable("dbos_greetings", (table) => {
    table.text("greeting_name");
    table.text("greeting_note_content");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTable("dbos_greetings");
};
