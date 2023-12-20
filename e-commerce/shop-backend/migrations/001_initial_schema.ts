import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('dbos_hello', table => {
    table.text('name').primary();
    table.integer('greet_count').defaultTo(0);
  });

  await knex.schema.createTable('cart', table => {
    table.string('username', 255).notNullable();
    table.integer('product_id').notNullable();
    table.integer('quantity').notNullable().defaultTo(1);
    table.primary(['username', 'product_id']);
  });

  await knex.schema.createTable('users', table => {
    table.string('username', 255).primary();
    table.string('password', 255).notNullable();
  });

  await knex.schema.createTable('orders', table => {
    table.increments('order_id').primary();
    table.string('username', 255).notNullable();
    table.integer('order_status').notNullable();
    table.string('stripe_session_id', 255).notNullable().defaultTo("");
    table.bigInteger('last_update_time').notNullable();
  });

  await knex.schema.createTable('order_items', table => {
    table.integer("order_id").notNullable();
    table.integer("product_id").notNullable();
    table.integer("price").notNullable();
    table.integer("quantity").notNullable();
    table.primary(['order_id', 'product_id']);
    table.foreign('order_id').references('orders.order_id');
  });

  await knex.schema.createTable('products', table => {
    table.increments('product_id').primary();
    table.string('product', 255).unique().notNullable();
    table.text('description').notNullable();
    table.string('image_name', 255).notNullable();
    table.integer('price').notNullable();
    table.integer('inventory').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('dbos_hello');
  await knex.schema.dropTable('cart');
  await knex.schema.dropTable('users');
  await knex.schema.dropTable('orders');
  await knex.schema.dropTable('order_items');
  await knex.schema.dropTable('products');
}
