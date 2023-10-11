import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {

  await knex.schema.createTable('session', table => {
    table.string('session_id', 255).primary();
    table.string('client_reference_id', 255).nullable();
    table.text('success_url').notNullable();
    table.text('cancel_url').notNullable();
    table.string('status').nullable();
  });
 
  await knex.schema.createTable('items', table => {
    table.increments("item_id", { primaryKey: true });
    table.text("description").notNullable();
    table.integer('quantity').notNullable();
    table.decimal('price').notNullable();
    table.string('session_id', 255).notNullable();
    table.foreign('session_id').references('session.session_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('session');
  await knex.schema.dropTable('items');
}
