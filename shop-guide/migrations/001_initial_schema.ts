import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('products', table => {
    table.integer('product_id').primary();
    table.string('product', 255).unique().notNullable();
    table.text('description').notNullable();
    table.string('image_name', 255).notNullable();
    table.integer('price').notNullable();
    table.integer('inventory').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('products');
}
