#!/bin/sh
set -e

echo "==> initialising database"
npx tsx scripts/init-db.ts

echo "==> starting RMA app on port 4500"
exec npx next start -p 4500
