#!/bin/bash

if [[ -z "${POSTGRES_HOST}" ]]; then
  export POSTGRES_HOST="localhost"
fi

################################################################
# Create the `shop` user and DB.
################################################################

# Create the new user 'shop'
psql -U postgres -h $POSTGRES_HOST -c "CREATE USER shop WITH PASSWORD 'shop';"
psql -U postgres -h $POSTGRES_HOST -c "ALTER USER shop CREATEDB;"

# Save the current value of PGPASSWORD to a variable
OLD_PGPASSWORD="$PGPASSWORD"

export PGPASSWORD='shop'
psql -U shop -h $POSTGRES_HOST -d postgres -c "DROP DATABASE IF EXISTS shop;"
psql -U shop -h $POSTGRES_HOST -d postgres -c "CREATE DATABASE shop;"

export PGPASSWORD="$OLD_PGPASSWORD"
psql -U postgres -h $POSTGRES_HOST -d shop -c "GRANT CREATE, USAGE ON SCHEMA public TO shop;"

################################################################
# Create tables for shop_app.
################################################################

export PGPASSWORD='shop'
psql -U shop -h $POSTGRES_HOST -d shop -c "
CREATE TABLE cart (
    username VARCHAR(255) NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    PRIMARY KEY (username, product_id)
);
"
psql -U shop -h $POSTGRES_HOST -d shop -c "
CREATE TABLE users (
    username VARCHAR(255) PRIMARY KEY NOT NULL,
    password VARCHAR(255) NOT NULL
);
"

psql -U shop -h $POSTGRES_HOST -d shop -c "
CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    order_status INT NOT NULL,
    stripe_session_id VARCHAR(255) DEFAULT '' NOT NULL,
    last_update_time BIGINT NOT NULL
);
"
psql -U shop -h $POSTGRES_HOST -d shop -c "
CREATE TABLE order_items (
    order_id INT,
    product_id INT,
    price INT NOT NULL,
    quantity INT,
    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);
"

################################################################
# Create and populate tables for product_service.
################################################################

psql -U shop -h $POSTGRES_HOST -d shop -c "
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product VARCHAR(255) UNIQUE NOT NULL,
    description VARCHAR(1024) NOT NULL,
    image_name VARCHAR(255) NOT NULL,
    price INT NOT NULL,
    inventory INTEGER NOT NULL
);
"

psql -U shop -h $POSTGRES_HOST -d shop -c "
CREATE TABLE products_idempotency (
    order_id INT NOT NULL,
    operation INT NOT NULL,
    value VARCHAR(255) NOT NULL,
    PRIMARY KEY (order_id, operation)
);
"

psql -U shop -h $POSTGRES_HOST -d shop -c "
INSERT INTO products VALUES (DEFAULT, 'Pen', 'This is a great pen.', 'pen.jpg', 9999, 100000);
"
psql -U shop -h $POSTGRES_HOST -d shop -c "
INSERT INTO products VALUES (DEFAULT,  'Pencil', 'This is a great pencil.', 'pencil.jpg', 8999, 100000);
"
