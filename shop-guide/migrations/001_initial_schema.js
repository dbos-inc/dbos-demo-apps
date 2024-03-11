exports.up = async function(knex) {
  await knex.schema.createTable('products', table => {
    table.integer('product_id').primary();
    table.string('product', 255).unique().notNullable();
    table.text('description').notNullable();
    table.string('image_name', 255).notNullable();
    table.integer('price').notNullable();
    table.integer('inventory').notNullable();
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('products');
};
