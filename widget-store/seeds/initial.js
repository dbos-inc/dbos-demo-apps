exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex("orders").del();
  await knex("products").del();

  // Inserts seed entries
  await knex("products").insert([
    {
      product_id: 1,
      product: "Premium Quality Widget",
      description: "Enhance your productivity with our top-rated widgets!",
      inventory: 12,
      price: 99.99
    },
  ]);
};
