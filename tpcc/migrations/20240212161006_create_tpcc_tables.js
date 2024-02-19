exports.up = async function(knex) {
  await knex.schema.createTable('warehouse', function (table) {
    table.integer('w_id').notNullable().primary();
    table.string('w_name', 10);
    table.string('w_street_1', 20);
    table.string('w_street_2', 20);
    table.string('w_city', 20);
    table.specificType('w_state', 'char(2)');
    table.specificType('w_zip', 'char(9)');
    table.decimal('w_tax', 4, 4);
    table.decimal('w_ytd', 12, 2);
  });

  await knex.schema.createTable('district', function (table) {
    table.integer('d_id').notNullable();
    table.integer('d_w_id').notNullable();
    table.string('d_name', 10);
    table.string('d_street_1', 20);
    table.string('d_street_2', 20);
    table.string('d_city', 20);
    table.specificType('d_state', 'char(2)');
    table.specificType('d_zip', 'char(9)');
    table.decimal('d_tax', 4, 4);
    table.decimal('d_ytd', 12, 2);
    table.integer('d_next_o_id');
    table.primary(['d_w_id', 'd_id']);
  });

  await knex.schema.createTable('customer', function (table) {
    table.integer('c_id').notNullable();
    table.integer('c_d_id').notNullable();
    table.integer('c_w_id').notNullable();
    table.string('c_first', 16);
    table.specificType('c_middle', 'char(2)');
    table.string('c_last', 16);
    table.string('c_street_1', 20);
    table.string('c_street_2', 20);
    table.string('c_city', 20);
    table.specificType('c_state', 'char(2)');
    table.specificType('c_zip', 'char(9)');
    table.specificType('c_phone', 'char(16)');
    table.timestamp('c_since').defaultTo(knex.fn.now());
    table.specificType('c_credit', 'char(2)');
    table.decimal('c_credit_lim', 12, 2);
    table.decimal('c_discount', 4, 4);
    table.decimal('c_balance', 12, 2);
    table.decimal('c_ytd_payment', 12, 2);
    table.integer('c_payment_cnt');
    table.integer('c_delivery_cnt');
    table.string('c_data', 500);
    table.primary(['c_w_id', 'c_d_id', 'c_id']);
  });

  await knex.schema.createTable('history', function(table) {
    table.integer('h_c_id').notNullable();
    table.integer('h_c_d_id').notNullable();
    table.integer('h_c_w_id').notNullable();
    table.integer('h_d_id').notNullable();
    table.integer('h_w_id').notNullable();
    table.timestamp('h_date').defaultTo(knex.fn.now());
    table.decimal('h_amount', 6, 2);
    table.string('h_data', 24);
  });

  await knex.schema.createTable('new_order', function(table) {
    table.integer('no_o_id').notNullable();
    table.integer('no_d_id').notNullable();
    table.integer('no_w_id').notNullable();
    table.primary(['no_w_id', 'no_d_id', 'no_o_id']);
  });

  await knex.schema.createTable('orders', function(table) {
    table.integer('o_id').notNullable();
    table.integer('o_d_id').notNullable();
    table.integer('o_w_id').notNullable();
    table.integer('o_c_id');
    table.timestamp('o_entry_d').defaultTo(knex.fn.now());
    table.integer('o_carrier_id');
    table.integer('o_ol_cnt');
    table.integer('o_all_local');
    table.primary(['o_w_id', 'o_d_id', 'o_id']);
  });

  await knex.schema.createTable('order_line', function(table) {
    table.integer('ol_o_id').notNullable();
    table.integer('ol_d_id').notNullable();
    table.integer('ol_w_id').notNullable();
    table.integer('ol_number').notNullable();
    table.integer('ol_i_id').notNullable();
    table.integer('ol_supply_w_id');
    table.timestamp('ol_delivery_d');
    table.integer('ol_quantity');
    table.decimal('ol_amount', 6, 2);
    table.specificType('ol_dist_info', 'char(24)');
    table.primary(['ol_w_id', 'ol_d_id', 'ol_o_id', 'ol_number']);
  });

  await knex.schema.createTable('stock', function(table) {
    table.integer('s_i_id').notNullable();
    table.integer('s_w_id').notNullable();
    table.integer('s_quantity');
    table.specificType('s_dist_01', 'char(24)');
    table.specificType('s_dist_02', 'char(24)');
    table.specificType('s_dist_03', 'char(24)');
    table.specificType('s_dist_04', 'char(24)');
    table.specificType('s_dist_05', 'char(24)');
    table.specificType('s_dist_06', 'char(24)');
    table.specificType('s_dist_07', 'char(24)');
    table.specificType('s_dist_08', 'char(24)');
    table.specificType('s_dist_09', 'char(24)');
    table.specificType('s_dist_10', 'char(24)');
    table.integer('s_ytd');
    table.integer('s_order_cnt');
    table.integer('s_remote_cnt');
    table.string('s_data', 50);
    table.primary(['s_w_id', 's_i_id']);
  });

  await knex.schema.createTable('item', function(table) {
    table.integer('i_id').notNullable().primary();
    table.integer('i_im_id');
    table.string('i_name', 24);
    table.decimal('i_price', 5, 2);
    table.string('i_data', 50);
  });

  return;
};

exports.down = async function(knex) {
  return knex.schema.dropTable('warehouse')
    .dropTable('district')
    .dropTable('customer')
    .dropTable('history')
    .dropTable('new_order')
    .dropTable('orders')
    .dropTable('order_line')
    .dropTable('stock')
    .dropTable('item');
};
