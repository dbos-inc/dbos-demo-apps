# Widget Store - Java Spring Boot Version

This is a Java Spring Boot port of the TypeScript Widget Store demo application. It demonstrates an online storefront built with Spring Boot, using Gradle for build management, simple SQL migrations, and jOOQ for database access.

## Features

- **Product Management**: View product details and inventory
- **Order Processing**: Create and track orders with different statuses
- **Inventory Management**: Automatic inventory tracking and manual restocking
- **RESTful API**: Full REST API for frontend integration
- **Simple SQL Migration**: Single SQL file for database schema setup
- **Type-Safe Database Access**: jOOQ for compile-time SQL verification

## Technology Stack

- **Framework**: Spring Boot 3.3.2
- **Build Tool**: Gradle 8.10
- **Database**: PostgreSQL
- **ORM/Database Access**: jOOQ
- **Java Version**: 21

## Prerequisites

- Java 21 or later
- PostgreSQL database running on localhost:5432
- Database named `widget_store_java` 
- PostgreSQL user `postgres` with password `dbos`

## Database Setup

### 1. Create the PostgreSQL database:
```bash
createdb -h localhost -U postgres widget_store_java
```

### 2. Run the database migration:
```bash
psql -h localhost -U postgres -d widget_store_java -f schema/init.sql
```

## Running the Application

### Using Gradle Wrapper (Recommended)

```bash
# Clean and build the project
./gradlew clean build

# Run the application
./gradlew bootRun
```

### Running the JAR directly

```bash
# Build the project
./gradlew build

# Run the generated JAR
java -jar build/libs/widget-store-0.0.1-SNAPSHOT.jar
```

The application will start on `http://localhost:3000`

## How to Use the Application

### 1. Access the Web Interface
Open your browser and go to: `http://localhost:3000`

You'll see a widget store interface with:
- **Product display**: Shows the Premium Quality Widget with current inventory and price
- **Recent Orders**: Lists all orders with their status (initially empty)
- **Server Tools**: Includes a crash simulation button for testing

### 2. Test the Basic Functionality

#### Purchase a Widget:
1. Click the **"Buy Now"** button
2. You'll be redirected to a payment confirmation page
3. Click **"Confirm Payment"** or **"Cancel Payment"**
4. You'll see the order status page with your order ID
5. The order will appear in the "Recent Orders" section

#### Restock Inventory:
- Click the **"Restock"** button next to the inventory count to reset inventory to 100

#### View Orders:
- All orders appear in the "Recent Orders" panel with their current status
- Orders show progress bars when in "PAID" status

### 3. Test the API Endpoints

You can also test the REST API directly:

```bash
# Get product information
curl http://localhost:3000/product

# Get all orders
curl http://localhost:3000/orders

# Get specific order (replace 1 with actual order ID)
curl http://localhost:3000/order/1

# Restock inventory
curl -X POST http://localhost:3000/restock

# Start checkout process (replace 'test123' with any unique key)
curl -X POST http://localhost:3000/checkout/test123

# Simulate payment webhook (replace 'test123' and 'paid' as needed)
curl -X POST http://localhost:3000/payment_webhook/test123/paid
# or for failed payment:
curl -X POST http://localhost:3000/payment_webhook/test123/failed
```

### 4. Monitor the Application

Check the application logs in your terminal to see:
- Database operations being performed
- Order processing status
- Any errors or warnings

### 5. Database Inspection

You can directly inspect the database to see the changes:

```bash
# View all orders
psql -h localhost -U postgres -d widget_store_java -c "SELECT * FROM orders;"

# View product inventory
psql -h localhost -U postgres -d widget_store_java -c "SELECT * FROM products;"

# View orders with status names (requires manual status mapping)
psql -h localhost -U postgres -d widget_store_java -c "
SELECT order_id, 
       CASE order_status 
           WHEN 0 THEN 'PENDING'
           WHEN 1 THEN 'DISPATCHED' 
           WHEN 2 THEN 'PAID'
           WHEN -1 THEN 'CANCELLED'
       END as status,
       last_update_time,
       progress_remaining
FROM orders ORDER BY order_id DESC;"
```

## Configuration

### Database Configuration

You can override the default database settings using environment variables or by modifying `src/main/resources/application.properties`:

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/widget_store_java
spring.datasource.username=postgres
spring.datasource.password=dbos
```

### jOOQ Code Generation

The project is configured to automatically generate jOOQ classes from your database schema. To manually trigger code generation:

```bash
./gradlew generateJooq
```

Note: This requires a running database with the schema already in place.

## API Endpoints

### Product Endpoints
- `GET /product` - Get product information
- `POST /restock` - Restock inventory to 100 units

### Order Endpoints
- `GET /orders` - Get all orders
- `GET /order/{orderId}` - Get specific order by ID

### Workflow Endpoints (Stubs)
- `POST /checkout/{key}` - Start checkout process (stub implementation)
- `POST /payment_webhook/{key}/{status}` - Handle payment webhook (stub implementation)

### Utility Endpoints
- `POST /crash_application` - Crash the application (for testing)

## Project Structure

```
├── schema/
│   └── init.sql                 # Database schema and initial data
├── src/
│   ├── main/
│   │   ├── java/com/example/widgetstore/
│   │   │   ├── controller/      # REST controllers
│   │   │   ├── service/         # Business logic layer
│   │   │   ├── model/           # Data models and enums
│   │   │   └── WidgetStoreApplication.java
│   │   └── resources/
│   │       ├── static/          # Static web content
│   │       └── application.properties
│   └── test/                    # Test files
└── build.gradle                 # Build configuration
```

## Database Schema

### Products Table
- `product_id` (INTEGER, PRIMARY KEY)
- `product` (VARCHAR(255), UNIQUE, NOT NULL)
- `description` (TEXT, NOT NULL)
- `inventory` (INTEGER, NOT NULL)
- `price` (DECIMAL(10,2), NOT NULL)

### Orders Table
- `order_id` (SERIAL, PRIMARY KEY)
- `order_status` (INTEGER, NOT NULL)
- `last_update_time` (TIMESTAMP, NOT NULL)
- `product_id` (INTEGER, FOREIGN KEY)
- `progress_remaining` (INTEGER, NOT NULL)

## Order Status Values

- `0` - PENDING
- `1` - DISPATCHED  
- `2` - PAID
- `-1` - CANCELLED

## Development

### Running Tests

```bash
./gradlew test
```

### Code Generation

To regenerate jOOQ classes after schema changes:

```bash
./gradlew flywayMigrate generateJooq
```

### Building for Production

```bash
./gradlew clean build
```

The executable JAR will be created in `build/libs/`

## Differences from TypeScript Version

This Java version maintains the same API and functionality as the original TypeScript version, with the following key differences:

1. **No DBOS Integration**: The DBOS workflow functionality has been replaced with stub implementations
2. **Spring Boot Framework**: Uses Spring Boot instead of Fastify
3. **jOOQ Database Access**: Uses jOOQ instead of Knex.js
4. **Simple SQL Migration**: Uses a single SQL file instead of Flyway migrations
5. **Java Type System**: Leverages Java's static typing and Spring's dependency injection
6. **Gradle Build System**: Uses Gradle instead of npm

## Quick Start Summary

Here's the complete process to get the application running:

```bash
# 1. Create database
createdb -h localhost -U postgres widget_store_java

# 2. Run migration
psql -h localhost -U postgres -d widget_store_java -f schema/init.sql

# 3. Start the application
./gradlew bootRun

# 4. Open browser to http://localhost:3000
```

## Troubleshooting

### Database Connection Issues
- **Error**: `Connection refused` or `database does not exist`
  - Ensure PostgreSQL is running: `pg_isready -h localhost -p 5432`
  - Verify database exists: `psql -h localhost -U postgres -l | grep widget_store_java`
  - Check credentials match those in `application.properties`

### Migration Issues
- **Error**: `relation "products" does not exist`
  - Run the migration: `psql -h localhost -U postgres -d widget_store_java -f schema/init.sql`
  - Verify tables exist: `psql -h localhost -U postgres -d widget_store_java -c "\dt"`

### jOOQ Generation Issues
- **Error**: `package com.example.widgetstore.generated does not exist`
  - Run: `./gradlew generateJooq`
  - Ensure database schema exists before generation
  - Check that generated files are in `build/generated-src/jooq/main/`

### Port Conflicts
- **Error**: `Port 3000 was already in use`
  - Change port in `application.properties`: `server.port=8080`
  - Or kill the process using port 3000: `lsof -ti:3000 | xargs kill -9`

### Build Issues
- **Error**: `Could not find or load main class`
  - Clean and rebuild: `./gradlew clean build`
  - Ensure all source files are in correct package structure

## License

This project is part of the DBOS demo applications and is provided for educational and demonstration purposes.