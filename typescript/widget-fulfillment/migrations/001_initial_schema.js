// Our schema
//
// An employee table
//  name
//  current_order
//  expiration
//  
// An order_employee table - that is populated by incoming Kafka messages.
//  order_id
//  order_status
//  product_id
//  product
//  employee_name

exports.up = async function(knex) {
  await knex.schema.createTable('employee', table => {
    table.string('employee_name', 255).primary();
    table.integer('order_id').unique();
    table.datetime('expiration').defaultTo(null);
  });

  await knex.schema.createTable('order_employee', table => {
    table.integer('order_id').primary();
    table.integer('order_status').notNullable();
    table.string('product', 255).defaultTo('');
    table.string('employee_name', 255).defaultTo(null);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('order_employee');
  await knex.schema.dropTable('employee');
};
