import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {

  await knex.schema.createTable('session', table => {
    table.string('session_id', 255).primary();
    table.string('client_reference_id', 255).nullable();
    table.text('success_url').notNullable();
    table.text('cancel_url').notNullable();
  });
 
  // TODO: line items
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('session');
}
