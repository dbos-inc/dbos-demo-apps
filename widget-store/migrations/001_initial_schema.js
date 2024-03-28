exports.up = async function(knex) {
  await knex.schema.createTable('products', table => {
    table.integer('product_id').primary();
    table.string('product', 255).unique().notNullable();
    table.text('description').notNullable();
    table.integer('inventory').notNullable();
    table.float('price').notNullable();
  });

  await knex.schema.createTable('orders', table => {
    table.increments('order_id').primary();
    table.integer('order_status').notNullable();
    table.bigInteger('last_update_time').notNullable();
    table.integer('product_id').notNullable();
    table.foreign('product_id').references('products.product_id');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('products');
  await knex.schema.dropTable('orders');
};
