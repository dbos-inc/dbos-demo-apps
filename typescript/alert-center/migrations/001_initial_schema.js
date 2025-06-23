const {
  createTransactionCompletionSchemaPG,
  createTransactionCompletionTablePG,
} = require('@dbos-inc/dbos-sdk/datasource');

// Our schema
//
// An employee table
//  name
//  current_alert
//  expiration
//  
// An alert_employee table - that is populated by incoming Kafka messages.
//  alert_id
//  alert_status
//  message
//  employee_name

exports.up = async function(knex) {
  await knex.schema.createTable('employee', table => {
    table.string('employee_name', 255).primary();
    table.integer('alert_id').unique();
    table.datetime('expiration').defaultTo(null);
  });

  await knex.schema.createTable('alert_employee', table => {
    table.integer('alert_id').primary();
    table.integer('alert_status').notNullable();
    table.string('message', 255).defaultTo('');
    table.string('employee_name', 255).defaultTo(null);
  });

  await knex.raw(createTransactionCompletionSchemaPG);
  await knex.raw(createTransactionCompletionTablePG);
};

exports.down = async function(knex) {
  await knex.schema.dropTable('alert_employee');
  await knex.schema.dropTable('employee');
};
