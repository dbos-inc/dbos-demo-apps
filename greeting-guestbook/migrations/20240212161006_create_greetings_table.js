exports.up = function(knex) {
    return knex.schema.createTable('greetings', table => {
        table.text('name');
        table.text('note');
      });
};

exports.down = function(knex) {
    return knex.schema.dropTable('greetings');
};

