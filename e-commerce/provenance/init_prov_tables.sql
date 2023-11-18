CREATE SCHEMA IF NOT EXISTS operon;

CREATE TABLE IF NOT EXISTS operon.transaction_outputs (
  workflow_uuid TEXT NOT NULL,
  function_id INT NOT NULL,
  output TEXT,
  error TEXT,
  txn_id TEXT,
  txn_snapshot TEXT NOT NULL,
  PRIMARY KEY (workflow_uuid, function_id));

CREATE TABLE cart(
    username character varying(255) NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);

CREATE TABLE order_items(
    order_id integer NOT NULL,
    product_id integer NOT NULL,
    price integer NOT NULL,
    quantity integer NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);

CREATE TABLE orders(
    order_id integer NOT NULL,
    username character varying(255) NOT NULL,
    order_status integer NOT NULL,
    stripe_session_id character varying(255) NOT NULL,
    last_update_time bigint NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);

CREATE TABLE products(
    product_id integer NOT NULL,
    product character varying(255) NOT NULL,
    description text NOT NULL,
    image_name character varying(255) NOT NULL,
    price integer NOT NULL,
    inventory integer NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);

CREATE TABLE users(
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);