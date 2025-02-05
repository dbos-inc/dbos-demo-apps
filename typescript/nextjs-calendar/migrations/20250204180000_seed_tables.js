const { Knex } = require("knex");

/*
 * It is generally not a good idea to seed data into tables in migrations.
 *   We did it for convenience, but please don't follow this example.
 */
exports.up = async function(knex) {
    // Insert predefined schedule data with exact times
    await knex('schedule').insert([
      {
        task: 'fetch_joke',
        id: '94c1aeb0-1b2d-4642-bb48-98c03b34fcaa',
        start_time: knex.raw("DATE_TRUNC('day', NOW() - INTERVAL '1 day') + INTERVAL '15 hours'"), // 3 PM yesterday
        end_time: knex.raw("DATE_TRUNC('day', NOW() + INTERVAL '30 days') + INTERVAL '16 hours'"), // 4 PM yesterday
        repeat: 'daily',
      },
      {
        task: 'throw_error',
        id: '0f1f2484-f5ea-49de-94f5-85258835b9c4',
        start_time: knex.raw("DATE_TRUNC('day', NOW() - INTERVAL '2 days') + INTERVAL '15 hours'"), // 3 PM yesterday
        end_time: knex.raw("DATE_TRUNC('day', NOW() - INTERVAL '2 days') + INTERVAL '16 hours'"), // 4 PM yesterday
        repeat: 'none',
      },
    ]);
    await knex('results').insert([
      {
        schedule_id: '94c1aeb0-1b2d-4642-bb48-98c03b34fcaa',
        task: 'fetch_joke',
        run_time: knex.raw("DATE_TRUNC('day', NOW() - INTERVAL '1 day') + INTERVAL '15 hours 5 minutes'"),
        result: '{"type":"general","setup":"How do you steal a coat?","punchline":"You jacket.","id":130}',
        error: '',
      },
      {
        schedule_id: '0f1f2484-f5ea-49de-94f5-85258835b9c4',
        task: 'throw_error',
        run_time: knex.raw("DATE_TRUNC('day', NOW() - INTERVAL '2 days') + INTERVAL '15 hours 5 minutes'"),
        result: '',
        error: 'This task is supposed to fail...',
      },
    ]);
};

exports.down = function(_knex) {
};