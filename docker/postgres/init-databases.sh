#!/usr/bin/env bash
set -Eeuo pipefail

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
: "${TEST_DB_PASSWORD:?TEST_DB_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$APP_DB_PASSWORD" \
  --set=test_password="$TEST_DB_PASSWORD" <<'SQL'
CREATE ROLE support_dev LOGIN PASSWORD :'app_password';
CREATE DATABASE support_dev OWNER support_dev;
REVOKE ALL ON DATABASE support_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE support_dev TO support_dev;

CREATE ROLE support_test LOGIN PASSWORD :'test_password';
CREATE DATABASE support_test OWNER support_test;
REVOKE ALL ON DATABASE support_test FROM PUBLIC;
GRANT CONNECT ON DATABASE support_test TO support_test;
SQL
