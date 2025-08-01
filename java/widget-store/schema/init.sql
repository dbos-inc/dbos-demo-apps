-- Create products table
CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    product VARCHAR(255) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    inventory INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL
);

-- Create orders table
CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    order_status INTEGER NOT NULL,
    last_update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    product_id INTEGER NOT NULL,
    progress_remaining INTEGER NOT NULL DEFAULT 10,
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Insert initial product data
INSERT INTO products (product_id, product, description, inventory, price) VALUES 
(1, 'Premium Quality Widget', 'Enhance your productivity with our top-rated widgets!', 100, 99.99);