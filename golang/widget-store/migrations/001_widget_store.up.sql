CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    order_status INTEGER NOT NULL,
    last_update_time TIMESTAMP DEFAULT now() NOT NULL,
    progress_remaining INTEGER DEFAULT 10 NOT NULL
);

CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product VARCHAR(255) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    inventory INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL
);