-- Runs once, when the pgdata volume is first created.
-- API tests use this second database so they never touch the demo data.
CREATE DATABASE taxi_test;
