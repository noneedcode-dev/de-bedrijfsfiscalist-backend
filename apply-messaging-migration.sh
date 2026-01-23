#!/bin/bash

# Helper script to apply messaging migration
# Usage: ./apply-messaging-migration.sh [DATABASE_URL]
#
# Get your DATABASE_URL from:
# Supabase Dashboard > Project Settings > Database > Connection string (Direct connection)

if [ -z "$1" ]; then
  echo "Usage: ./apply-messaging-migration.sh [DATABASE_URL]"
  echo ""
  echo "Get your connection string from Supabase Dashboard:"
  echo "Project Settings > Database > Connection string (Direct connection)"
  exit 1
fi

DATABASE_URL="$1"

echo "Applying messaging migration..."
psql "$DATABASE_URL" -f supabase/migrations/20260122_add_messaging.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration applied successfully!"
else
  echo "❌ Migration failed. Please check the error above."
  exit 1
fi
