#!/bin/sh
set -eu
# The app health dependency ensures migrations have completed before startup.
# Re-generate for the exact schema copied into this worker image.
yarn prisma generate
exec yarn tsx worker/server.ts
