import { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex("cart").del();
  await knex("order_items").del();
  await knex("orders").del();
  await knex("products").del();
  await knex("users").del();

  // Inserts seed entries
  await knex("products").insert([
    {
      product_id: 1,
      product: "Pen",
      description: "This is a great pen.",
      image_name: "pen.jpg",
      price: 9999,
      inventory: 100000
    },
    {
      product_id:2,
      product: "Pencil",
      description: "This is a great pencil.",
      image_name: "pencil.jpg",
      price: 8999,
      inventory: 100000
    },
  ]);
};
