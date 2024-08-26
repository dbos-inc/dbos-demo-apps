const { Knex } = require("knex");

exports.up = async function(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "vector"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  return knex.schema.createTable('papers_metadata', table => {
    table.text('name').notNullable();
    table.text('url').notNullable();
    table.text('id').defaultTo(knex.raw('uuid_generate_v4()')).primary();
  });
};

exports.down = async function(knex) {
  return knex.schema.dropTable('papers_metadata');
};
