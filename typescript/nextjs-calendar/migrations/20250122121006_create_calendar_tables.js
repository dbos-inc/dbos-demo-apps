const { Knex } = require("knex");

exports.up = function(knex) {
  return knex.schema
    .createTable('schedule', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));  // Use UUID as primary key
      table.string('task').notNullable();  // Task ID
      table.datetime('start_time').notNullable();  // Scheduled time
      table.datetime('end_time').notNullable();  // Scheduled time
      table.string('repeat').notNullable();  // Repetition options
      table.timestamps(true, true);  // Adds created_at and updated_at timestamps
    })
    .createTable('results', (table) => {
      table.uuid('schedule_id').notNullable();
      table.datetime('run_time').notNullable();
      table.text('result');  // Store the task result

      table.foreign('schedule_id').references('id').inTable('schedule').onDelete('CASCADE');
      table.primary(['schedule_id', 'run_time']);  // Composite primary key
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('results')
    .dropTableIfExists('schedule');
};