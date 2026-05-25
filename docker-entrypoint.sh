#!/bin/sh
set -e
node dist/infrastructure/db/migrate.js up
node dist/infrastructure/db/seed.js
exec node dist/main.js
