exports.up = async function (knex) {
  await knex.schema.createTable('products', (table) => {
    table.integer('product_id').primary();
    table.string('product', 255).unique().notNullable();
    table.text('description').notNullable();
    table.integer('inventory').notNullable();
    table.float('price').notNullable();
  });

  await knex.schema.createTable('orders', (table) => {
    table.increments('order_id').primary();
    table.integer('order_status').notNullable();
    table.datetime('last_update_time').notNullable().defaultTo(knex.fn.now());
    table.integer('product_id').notNullable();
    table.foreign('product_id').references('products.product_id');
    table.integer('progress_remaining').notNullable().defaultTo(10);
  });
  await knex('products').insert([
    {
      product_id: 1,
      product: 'Premium Quality Widget',
      description: 'Enhance your productivity with our top-rated widgets!',
      inventory: 100,
      price: 99.99,
    },
  ]);
};

exports.down = async function (knex) {
  await knex.schema.dropTable('orders');
  await knex.schema.dropTable('products');
};
