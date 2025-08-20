-- Database initialization script for WOO HFT Trading Bot
-- This script runs when the PostgreSQL container starts for the first time

-- Ensure the database exists
SELECT 'CREATE DATABASE woo_trading' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'woo_trading');

-- Connect to the database
\c woo_trading;

-- Create a schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS public;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE woo_trading TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA public TO postgres;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;

-- Log successful initialization
SELECT 'Database woo_trading initialized successfully' as status;
