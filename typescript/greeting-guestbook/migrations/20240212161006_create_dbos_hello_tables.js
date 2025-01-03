const { Knex } = require("knex");

exports.up = async function(knex) {
  return knex.schema.createTable('dbos_greetings', table => {
    table.increments('greet_count');
    table.text('greeting_name');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('dbos_greetings');
};
