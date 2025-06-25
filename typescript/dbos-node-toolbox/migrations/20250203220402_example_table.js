const {
  KnexDataSource
} = require('@dbos-inc/knex-datasource');

exports.up = async function(knex) {
  await knex.schema.createTable('example_table', function(table) {
    table.increments('count').primary();
    table.string('name').notNullable();
  });

  await KnexDataSource.initializeSchema(knex);
};

exports.down = async function(knex) {
  await knex.schema.dropTable('example_table');

  await KnexDataSource.uninitializeSchema(knex);
};