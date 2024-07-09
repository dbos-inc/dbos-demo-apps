exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex("order_packer").del();
  await knex("packer").del();
};
