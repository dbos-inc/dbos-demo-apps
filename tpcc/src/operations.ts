import { TransactionContext, Transaction, GetApi, HandlerContext, ArgSources, ArgSource } from '@dbos-inc/dbos-sdk';
import { Knex } from 'knex';
import { getRandomInt, getCustomerName } from "./utils";

const DIST_PER_WAREHOUSE = 10; // Districts per warehouse
const CUSTOMER_PER_DIST = 3000;
const NUM_ITEMS = 100000;
const INVALID_ITEM_ID = -12345;

export class TPCC {

  @GetApi('/payment/:warehouses')
  static async paymentHandler(ctxt: HandlerContext, @ArgSource(ArgSources.URL) warehouses: number) {
    const w_id = getRandomInt(warehouses) + 1;
    const d_id = getRandomInt(DIST_PER_WAREHOUSE) + 1;
    let c_d_id, c_w_id;
    // eslint-disable-next-line @dbos-inc/dbos-static-analysis
    if (Math.random() <= 0.85) {
      c_d_id = d_id;
      c_w_id = w_id;
    } else {
      c_d_id = getRandomInt(DIST_PER_WAREHOUSE) + 1;
      c_w_id = warehouses > 1 ? getRandomInt(warehouses, w_id - 1) + 1 : w_id;
    }

    // 60% lookups by last name
    let customer;
    // eslint-disable-next-line @dbos-inc/dbos-static-analysis
    if (Math.random() <= 0.6) {
      customer = getCustomerName();
    } else {
      customer = getRandomInt(CUSTOMER_PER_DIST) + 1;
    }

    const h_amount = (getRandomInt(500000) + 100) / 100;

    try {
      const res = await ctxt.invoke(TPCC).payment(w_id, d_id, c_w_id, c_d_id, customer, h_amount);
      return res;
    } catch (err) {
      const error = err as Error;
      ctxt.logger.error(`Error payment: ${error.message}`);
      return `Error payment: ${error.message}`;
    }
  }

  @GetApi('/neworder/:warehouses')
  static async newOrderHandler(ctxt: HandlerContext, @ArgSource(ArgSources.URL) warehouses: number) {
    const w_id = getRandomInt(warehouses) + 1;
    const districtID = getRandomInt(DIST_PER_WAREHOUSE) + 1;
    const customerID = getRandomInt(CUSTOMER_PER_DIST) + 1;
  
    const itemCount = getRandomInt(11) + 5;
    const orderLines = new Array<{ itemID: number, supplierWarehouseID: number, quantity: number, }>(itemCount);
  
    for (let i = 0; i < itemCount; i++) {
      // eslint-disable-next-line @dbos-inc/dbos-static-analysis
      const itemID = Math.floor(Math.random() * NUM_ITEMS) + 1;
      // eslint-disable-next-line @dbos-inc/dbos-static-analysis
      const quantity = Math.floor(Math.random() * 10) + 1;
      const supplierWarehouseID = warehouses > 1 ? getRandomInt(warehouses, w_id - 1) + 1 : w_id;
      orderLines[i] = { itemID, supplierWarehouseID, quantity };
    }
  
    // We need to cause 1% of the new orders to be rolled back.
    if (getRandomInt(100) + 1 === 1) {
      orderLines[itemCount - 1].itemID = INVALID_ITEM_ID;
    }
  
    try {
      const res = await ctxt.invoke(TPCC).newOrder(w_id, districtID, customerID, orderLines);
      return res;
    } catch (err) {
      const error = err as Error;
      ctxt.logger.error(`Error new order: ${error.message}`);
      return `Error new order: ${error.message}`;
    }
  }

  @Transaction({isolationLevel: "REPEATABLE READ"})  // Run this function as a database transaction
  static async newOrder(
    ctxt: TransactionContext<Knex>,
    warehouseID: number,
    districtID: number,
    customerID: number,
    orderLines: readonly { itemID: number, supplierWarehouseID: number, quantity: number, }[],
  ) {
    const client = ctxt.client;

    // The row in the WAREHOUSE table with matching W_ID is selected and W_TAX, the warehouse tax rate, is retrieved
    const r0 = await client<Warehouse>("warehouse")
      .where({ w_id: warehouseID })
      .select("w_tax")
      .first();
    if (!r0) throw new Error(`W_ID=${warehouseID} not found!`);
    const { w_tax } = r0;

    // The row in the DISTRICT table with matching D_W_ID and D_ ID is selected, D_TAX, the district tax rate, and D_NEXT_O_ID, the next available order number for the district, are retrieved
    const r1 = await client<District>("district")
      .where({ d_w_id: warehouseID, d_id: districtID })
      .select("d_tax", "d_next_o_id")
      .forUpdate()
      .first();
    if (!r1) throw new Error(`W_ID=${warehouseID} D_ID=${districtID} not found!`);
    const { d_tax, d_next_o_id } = r1;

    // D_NEXT_O_ID for the district is incremented by one
    const r2 = await client<District>("district")
      .update({ d_next_o_id: d_next_o_id + 1 })
      .where({ d_w_id: warehouseID, d_id: districtID });
    if (r2 !== 1) throw new Error(`Cannot update next_order_id on district for D_ID=${districtID} D_W_ID=${warehouseID}`);

    // The row in the CUSTOMER table with matching C_W_ID, C_D_ID, and C_ID is selected and C_DISCOUNT, the customer's discount rate, C_LAST, the customer's last name, and C_CREDIT, the customer's credit status, are retrieved.
    const r3 = await client<Customer>("customer")
      .select("c_discount", "c_last", "c_credit")
      .where({ c_w_id: warehouseID, c_d_id: districtID, c_id: customerID })
      .forUpdate()
      .first();
    if (!r3) throw new Error(`W_ID=${warehouseID} D_ID=${districtID} C_ID=${customerID} not found!`);
    const { c_discount, c_last, c_credit } = r3;

    // An order-line is said to be home if it is supplied by the home warehouse (OL_SUPPLY_W_ID == O_W_ID))
    // An order-line is said to be remote if it is not supplied by the home warehouse (OL_SUPPLY_W_ID != O_W_ID))
    // If the order includes only home order-lines, then O_ALL_LOCAL is set to 1, otherwise O_ALL_LOCAL is set to 0
    const o_all_local = orderLines.every(v => v.supplierWarehouseID === warehouseID) ? 1 : 0;

    // A new row is inserted into both the NEW-ORDER table and the ORDER table to reflect the creation of the new order. 
    // Note, in the Benchbase PG TPC-C schema, o_entry_d defaults to the current timestamp. Other implementations sometimes 
    // set the o_entry_d column explicitly. However, since we're not actually benchmarking here, we can deviate from the spec
    const r4 = await client<Order>("orders")
      .insert({ o_w_id: warehouseID, o_d_id: districtID, o_id: d_next_o_id, o_c_id: customerID, o_ol_cnt: orderLines.length, o_all_local })
      .returning("o_entry_d");
    if (r4.length !== 1) throw new Error(`Unexpected result from orders insert`);
    const { o_entry_d } = r4[0];

    // the automatic return type for Knex.insert (number[]) doesn't seem to match runtime behavior
    // explicitly specify insert return type in order to validate execution
    const r5 = await client<NewOrder>("new_order")
      .insert<{ rowCount: number }>({ no_w_id: warehouseID, no_d_id: districtID, no_o_id: d_next_o_id });
    if (r5.rowCount !== 1) throw new Error(`Unexpected result from new_order insert`);

    const resultLineItems = new Array<NewOrderResultLineItem>();
    // For each O_OL_CNT item on the order
    for (let index = 0; index < orderLines.length; index++) {
      const { itemID: ol_i_id, supplierWarehouseID: ol_supply_w_id, quantity: ol_quantity } = orderLines[index];

      // The row in the ITEM table with matching I_ID (equals OL_I_ID) is selected and I_PRICE, the price of the item, I_NAME, the name of the item, and I_DATA are retrieved. 
      const r6 = await client<Item>("item")
        .select("i_price", "i_name", "i_data")
        .where({ i_id: ol_i_id })
        .first();
      if (!r6) throw new Error(`I_ID=${ol_i_id} not found!`);
      const { i_price, i_name, i_data } = r6;

      // The row in the STOCK table with matching S_I_ID (equals OL_I_ID) and S_W_ID (equals OL_SUPPLY_W_ID) is selected.
      // S_QUANTITY, the quantity in stock, S_DIST_xx, where xx represents the district number, and S_DATA are retrieved. 
      const getStockResult = await client<Stock>("stock")
        .select("s_quantity", "s_data", "s_dist_01", "s_dist_02", "s_dist_03", "s_dist_04", "s_dist_05", "s_dist_06", "s_dist_07", "s_dist_08", "s_dist_09", "s_dist_10")
        .where({ s_i_id: ol_i_id, s_w_id: warehouseID })
        .forUpdate()
        .first();
      if (!getStockResult) throw new Error(`S_I_ID=${ol_i_id} S_W_ID=${ol_supply_w_id} not found!`);
      const { s_quantity, s_data } = getStockResult;

      const r8 = await client<Stock>("stock")
        .update({
          // If the retrieved value for S_QUANTITY exceeds OL_QUANTITY by 10 or more, then S_QUANTITY is decreased by OL_QUANTITY; otherwise S_QUANTITY is updated to (S_QUANTITY - OL_QUANTITY)+91.
          s_quantity: s_quantity - ol_quantity + (s_quantity >= (ol_quantity + 10) ? 0 : 91),
          // S_YTD is increased by OL_QUANTITY 
          s_ytd: client.raw("s_ytd + ?", [ol_quantity]),
          // S_ORDER_CNT is incremented by 1
          s_order_cnt: client.raw("s_order_cnt + ?", [1]),
          // If the order-line is remote, then S_REMOTE_CNT is incremented by 1.
          s_remote_cnt: client.raw("s_remote_cnt + ?", [ol_supply_w_id === warehouseID ? 0 : 1]),
        })
        .where({ s_i_id: ol_i_id, s_w_id: warehouseID });
      if (r8 !== 1) throw new Error(`S_I_ID=${ol_i_id} S_W_ID=${ol_supply_w_id} not found!`);

      // The amount for the item in the order (OL_AMOUNT) is computed as: OL_QUANTITY * I_PRICE
      const ol_amount = ol_quantity * i_price;

      // The strings in I_DATA and S_DATA are examined. If they both include the string "ORIGINAL", the brand generic field for that item is set to "B", otherwise, the brand-generic field is set to "G"
      const brand_generic = i_data.includes("ORIGINAL") && s_data.includes("ORIGINAL") ? "B" : "G";

      // A new row is inserted into the ORDER-LINE table to reflect the item on the order.
      // OL_DELIVERY_D is set to a null value,
      // OL_NUMBER is set to a unique value within all the ORDER-LINE rows that have the same OL_O_ID value, 
      // and OL_DIST_INFO is set to the content of S_DIST_xx, where xx represents the district number (OL_D_ID)
      // Like the new_order insert above (r5), explicitly specify insert return type in order to validate execution
      const r9 = await client<OrderLine>("order_line")
        .insert<{ rowCount: number }>({
          ol_o_id: d_next_o_id,
          ol_d_id: districtID,
          ol_w_id: warehouseID,
          ol_number: index + 1,
          ol_i_id,
          ol_supply_w_id,
          ol_quantity,
          ol_amount,
          ol_dist_info: getDistInfo(getStockResult, districtID)
        });
      if (r9.rowCount !== 1) throw new Error(`Unexpected result from order_line insert`);

      resultLineItems.push({
        brand_generic,
        I_NAME: i_name,
        I_PRICE: i_price,
        OL_AMOUNT: ol_amount,
        OL_I_ID: ol_i_id,
        OL_QUANTITY: ol_quantity,
        OL_SUPPLY_W_ID: ol_supply_w_id,
        S_QUANTITY: s_quantity
      });
    }

    // The total-amount for the complete order is computed as: sum(OL_AMOUNT) * (1 - C_DISCOUNT) * (1 + W_TAX + D_TAX)
    let total_amount = 0;
    resultLineItems.forEach(v => total_amount += v.OL_AMOUNT);
    total_amount = total_amount * (1 - c_discount) * (1 + w_tax + d_tax);

    return <NewOrderResult>{
      W_ID: warehouseID,
      D_ID: districtID,
      C_ID: customerID,
      O_ID: d_next_o_id,
      O_OL_CNT: orderLines.length,
      C_LAST: c_last,
      C_CREDIT: c_credit,
      C_DISCOUNT: c_discount,
      W_TAX: w_tax,
      D_TAX: d_tax,
      O_ENTRY_D: o_entry_d,
      total_amount,
      lineItems: resultLineItems
    };
  }

  @Transaction({isolationLevel: "REPEATABLE READ"})
  static async payment(
    ctxt: TransactionContext<Knex>,
    w_id: number,
    d_id: number,
    c_w_id: number,
    c_d_id: number,
    customerID: string | number,
    h_amount: number
  ) {
    const client = ctxt.client;

    // The row in the WAREHOUSE table with matching W_ID is selected. 
    // W_NAME, W_STREET_1, W_STREET_2, W_CITY, W_STATE, and W_ZIP are retrieved 
    const r0 = await client<Warehouse>("warehouse")
      .select("w_name", "w_street_1", "w_street_2", "w_city", "w_state", "w_zip")
      .where({ w_id })
      .first();
    if (!r0) throw new Error(`W_ID=${w_id} not found!`);
    const { w_name, w_street_1, w_street_2, w_city, w_state, w_zip } = r0;

    // W_YTD, the warehouse's year-to-date  balance, is increased by H_ AMOUNT.
    const r1 = await client<Warehouse>("warehouse")
      .update({ w_ytd: client.raw("w_ytd + ?", [h_amount]) }).where({ w_id });
    if (r1 !== 1) throw new Error(`W_ID=${w_id} not found!`);

    // The row in the DISTRICT table with matching D_W_ID and D_ ID is selected.
    // D_NAME, D_STREET_1, D_STREET_2, D_CITY, D_STATE, and D_ZIP are retrieved.
    const r2 = await client<District>("district")
      .select("d_name", "d_street_1", "d_street_2", "d_city", "d_state", "d_zip")
      .where({ d_w_id: w_id, d_id: d_id })
      .first();
    if (!r2) throw new Error(`W_ID=${w_id} D_ID=${d_id} not found!`);
    const { d_name, d_street_1, d_street_2, d_city, d_state, d_zip } = r2;

    // D_YTD, the district's year-to-date balance, is increased by H_AMOUNT.
    const r3 = await client<District>("district")
      .update({ d_ytd: client.raw("d_ytd + ?", [h_amount]) })
      .where({ d_w_id: w_id, d_id: d_id });
    if (r3 !== 1) throw new Error(`W_ID=${w_id} D_ID=${d_id} not found!`);

    // retrieve customer by ID or name, depending on what was provided
    const { c_id, c_first, c_middle, c_last, c_street_1, c_street_2, c_city, c_state, c_zip, c_phone, c_since, c_credit, c_credit_lim, c_discount, c_balance } = typeof customerID === 'number'
      ? await getCustomerById(client, c_w_id, d_id, customerID)
      : await getCustomerByName(client, c_w_id, d_id, customerID);

    // C_BALANCE is decreased by H_AMOUNT. C_YTD_PAYMENT is increased by H_AMOUNT. C_PAYMENT_CNT is incremented by 1.
    const r5 = await client<Customer>("customer")
      .update({
        c_balance: client.raw("c_balance - ?", [h_amount]),
        c_ytd_payment: client.raw("c_ytd_payment + ?", [h_amount]),
        c_payment_cnt: client.raw("c_payment_cnt + ?", [1])
      })
      .where({ c_w_id, c_d_id, c_id });
    if (r5 !== 1) throw new Error(`W_ID=${w_id} D_ID=${d_id} C_ID=${c_id} not found!`);

    let c_data = "";
    if (c_credit === "BC") {
      // If the value of C_CREDIT is equal to "BC", then C_DATA is also retrieved from the selected customer
      const r6 = await client<Customer>("customer")
        .select("c_data")
        .where({ c_w_id, c_d_id: d_id, c_id })
        .first();
      if (!r6) throw new Error(`W_ID=${w_id} D_ID=${d_id} C_ID=${c_id} not found!`);
      c_data = r6.c_data;

      // C_ID, C_D_ID, C_W_ID, D_ID, W_ID, and H_AMOUNT, are inserted at the left of the C_DATA field 
      // by shifting the existing content of C_DATA to the right by an equal number of bytes 
      // and by discarding the bytes that are shifted out of the right side of the C_DATA field. 
      // The content of the C_DATA field never exceeds 500 characters. 
      const $c_data = `${c_id} ${c_d_id} ${c_w_id} ${d_id} ${w_id} ${h_amount}|${c_data}`.substring(0, 500);

      // C_DATA is updated to include the data string H_AMOUNT|C_DATA
      const r7 = await client<Customer>("customer")
        .update({ c_data: $c_data })
        .where({ c_w_id, c_d_id: c_d_id, c_id });
      if (r7 !== 1) throw new Error(`W_ID=${w_id} D_ID=${d_id} C_ID=${c_id} not found!`);
    }

    const h_data = `${w_name.substring(0, 10)}    ${d_name.substring(0, 10)}`;
    const r8 = await client<History>('history')
      .insert({
        h_c_d_id: c_d_id,
        h_c_w_id: c_w_id,
        h_c_id: c_id,
        h_d_id: d_id,
        h_w_id: w_id,
        h_amount,
        h_data
      })
      .returning("h_date");
    if (r8.length !== 1) throw new Error(`Unexpected result from history insert`);
    const { h_date } = r8[0];
  
    return {
      w_id,
      d_id,
      c_id,
      c_d_id,
      c_w_id,
      w_street_1,
      w_street_2, 
      w_city,
      w_state,
      w_zip,
      d_street_1,
      d_street_2,
      d_city,
      d_state,
      d_zip,
      c_first,
      c_middle,
      c_last,
      c_street_1,
      c_street_2,
      c_city,
      c_state,
      c_zip,
      c_phone,
      c_since,
      c_credit,
      c_credit_lim,
      c_discount,
      c_balance,
      c_data: c_credit === "BC" ? c_data.substring(0, 200) : undefined,
      h_amount,
      h_date
    };
  }
}

async function getCustomerById(client: Knex, w_id: number, d_id: number, c_id: number) {
  // The row in the CUSTOMER table with matching C_W_ID, C_D_ID, and C_ID is selected.
  // C_FIRST, C_MIDDLE, C_LAST, C_STREET_1, C_STREET_2, C_CITY, C_STATE, C_ZIP, C_PHONE, C_SINCE, C_CREDIT, C_CREDIT_LIM, C_DISCOUNT, and C_BALANCE are retrieved.
  const result = await client<Customer>("customer")
    .select("c_id", "c_first", "c_middle", "c_last", "c_street_1", "c_street_2", "c_city", "c_state", "c_zip", "c_phone", "c_since", "c_credit", "c_credit_lim", "c_discount", "c_balance")
    .where({ c_w_id: w_id, c_d_id: d_id, c_id })
    .first();
  if (!result) throw new Error(`W_ID=${w_id} D_ID=${d_id} C_ID=${c_id} not found!`);
  return result;
}

async function getCustomerByName(client: Knex, w_id: number, d_id: number, c_last: string) {
  // all rows in the CUSTOMER table with matching C_W_ID, C_D_ID and C_LAST are selected sorted by C_FIRST in ascending order.
  // C_ID, C_FIRST, C_MIDDLE, C_STREET_1, C_STREET_2, C_CITY, C_STATE, C_ZIP, C_PHONE, C_SINCE, C_CREDIT, C_CREDIT_LIM, C_DISCOUNT, and C_BALANCE are retrieved
  const result = await client<Customer>("customer")
    .select("c_id", "c_first", "c_middle", "c_last", "c_street_1", "c_street_2", "c_city", "c_state", "c_zip", "c_phone", "c_since", "c_credit", "c_credit_lim", "c_discount", "c_balance")
    .where({ c_w_id: w_id, c_d_id: d_id, c_last })
    .orderBy("c_first");
  if (result.length === 0) throw new Error(`W_ID=${w_id} D_ID=${d_id} C_LAST=${c_last} not found!`);

  // return row at position (n/2 rounded up to the next integer) in the sorted set of selected rows
  const index = Math.floor(result.length / 2);
  return result.length % 2 === 0 ? result[index - 1] : result[index];
}

function getDistInfo(stock: Pick<Stock, "s_quantity" | "s_data" | "s_dist_01" | "s_dist_02" | "s_dist_03" | "s_dist_04" | "s_dist_05" | "s_dist_06" | "s_dist_07" | "s_dist_08" | "s_dist_09" | "s_dist_10">, districtID: number): string {
  switch (districtID) {
    case 1: return stock.s_dist_01;
    case 2: return stock.s_dist_02;
    case 3: return stock.s_dist_03;
    case 4: return stock.s_dist_04;
    case 5: return stock.s_dist_05;
    case 6: return stock.s_dist_06;
    case 7: return stock.s_dist_07;
    case 8: return stock.s_dist_08;
    case 9: return stock.s_dist_09;
    case 10: return stock.s_dist_10;
    default: throw new Error(`Invalid districtID=${districtID}`);
  }
}

interface Customer {
  c_w_id: number;
  c_d_id: number;
  c_id: number;
  c_discount: number;
  c_credit: string;
  c_last: string;
  c_first: string;
  c_credit_lim: number;
  c_balance: number;
  c_ytd_payment: number;
  c_payment_cnt: number;
  c_delivery_cnt: number;
  c_street_1: string;
  c_street_2: string;
  c_city: string;
  c_state: string;
  c_zip: string;
  c_phone: string;
  c_since: number;
  c_middle: string;
  c_data: string;
}

interface District {
  d_id: number;
  d_w_id: number;
  d_ytd: number;
  d_tax: number;
  d_next_o_id: number;
  d_name: string;
  d_street_1: string;
  d_street_2: string;
  d_city: string;
  d_state: string;
  d_zip: string;
}

interface History {
  h_c_id: number;
  h_c_d_id: number;
  h_c_w_id: number;
  h_d_id: number;
  h_w_id: number;
  h_date: number;
  h_amount: number;
  h_data: string;
}

interface Item {
  i_id: number;
  i_im_id: number;
  i_name: string;
  i_price: number;
  i_data: string;
}

interface NewOrder {
  no_o_id: number;
  no_d_id: number;
  no_w_id: number;
}

interface Order {
  o_id: number;
  o_d_id: number;
  o_w_id: number;
  o_c_id: number;
  o_entry_d: number;
  o_carrier_id: number;
  o_ol_cnt: number;
  o_all_local: number;
}

interface OrderLine {
  ol_o_id: number;
  ol_d_id: number;
  ol_w_id: number;
  ol_number: number;
  ol_i_id: number;
  ol_supply_w_id: number;
  ol_delivery_d: number;
  ol_quantity: number;
  ol_amount: number;
  ol_dist_info: string;
}

interface Stock {
  s_i_id: number;
  s_w_id: number;
  s_quantity: number;
  s_ytd: number;
  s_order_cnt: number;
  s_remote_cnt: number;
  s_data: string;
  s_dist_01: string;
  s_dist_02: string;
  s_dist_03: string;
  s_dist_04: string;
  s_dist_05: string;
  s_dist_06: string;
  s_dist_07: string;
  s_dist_08: string;
  s_dist_09: string;
  s_dist_10: string;
}

interface Warehouse {
  w_id: number;
  w_ytd: number;
  w_tax: number;
  w_name: string;
  w_street_1: string;
  w_street_2: string;
  w_city: string;
  w_state: string;
  w_zip: string;
}

interface NewOrderResult {
  W_ID: number,
  D_ID: number,
  C_ID: number,
  O_ID: number,
  O_OL_CNT: number,
  C_LAST: string,
  C_CREDIT: string,
  C_DISCOUNT: number,
  W_TAX: number,
  D_TAX: number,
  O_ENTRY_D: number,
  total_amount: number,
  lineItems: NewOrderResultLineItem[]
}

interface NewOrderResultLineItem {
  OL_SUPPLY_W_ID: number,
  OL_I_ID: number,
  I_NAME: string,
  OL_QUANTITY: number,
  S_QUANTITY: number,
  brand_generic: string,
  I_PRICE: number,
  OL_AMOUNT: number
}
