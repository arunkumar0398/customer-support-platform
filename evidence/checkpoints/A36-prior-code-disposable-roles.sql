-- One-time local-only role/database setup for the A36 previous-code run.
-- Execute as the container's postgres superuser only in the disposable
-- csp-a36-compat-postgres-20261101 container; credentials are fake.
DO $$
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'A36 role setup requires disposable postgres/postgres identity';
  END IF;
END $$;

CREATE ROLE support_test LOGIN PASSWORD 'A36-local-test-only-password-not-a-secret'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE support_dev LOGIN PASSWORD 'A36-local-test-only-password-not-a-secret'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE support_test OWNER support_test;
CREATE DATABASE support_dev OWNER support_dev;
REVOKE CONNECT ON DATABASE support_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE support_dev TO support_dev;
