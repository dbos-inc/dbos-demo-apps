exports.up = function(knex) {
    return knex.schema.createTable('example_table', function(table) {
      table.increments('count').primary();
      table.string('name').notNullable();
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.dropTable('example_table');
  };