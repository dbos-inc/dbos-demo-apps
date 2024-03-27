exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex("order_items").del();
  await knex("orders").del();
  await knex("cart").del();
  await knex("products").del();
  await knex("users").del();

  // Inserts seed entries
  await knex("products").insert([
    {
      product_id: 1,
      product: "Pen",
      description: "This is a great pen.",
      image_name: "pen.jpg",
      price: 100,
      inventory: 10
    },
  ]);
  await knex("users").insert([
    {
      username: "dbos-testuser",
      password: "useless-password",
    },
  ]);
};
