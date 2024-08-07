// Our schema
//
// A packer table
//  name
//  current_order
//  expiration
//  
// An order_packer table - that is populated by incoming Kafka messages.
//  order_id
//  order_status
//  product_id
//  product
//  packer_name

exports.up = async function(knex) {
  await knex.schema.createTable('packer', table => {
    table.string('packer_name', 255).primary();
    table.integer('order_id').unique();
    table.datetime('expiration').defaultTo(null);
  });

  await knex.schema.createTable('order_packer', table => {
    table.integer('order_id').primary();
    table.integer('order_status').notNullable();
    table.integer('product_id').notNullable();
    table.string('product', 255).defaultTo('');
    table.string('packer_name', 255).defaultTo(null);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('order_packer');
  await knex.schema.dropTable('packer');
};
