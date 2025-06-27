exports.up = async function(knex) {
  await knex.schema.createTable('example_table', function(table) {
    table.increments('count').primary();
    table.string('name').notNullable();
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('example_table');
};