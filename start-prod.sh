#!/bin/bash
trap "" SIGHUP SIGTERM SIGPIPE
cd /home/z/my-project
export DATABASE_URL="postgresql://heavix@localhost:5432/heavix?schema=public"
export PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH"
export NODE_OPTIONS="--max-old-space-size=384"
export PORT=3000
export HOSTNAME=0.0.0.0
while true; do
  echo "[$(date '+%H:%M:%S')] prod-watchdog: starting standalone server..." >> /home/z/my-project/prod.log
  node .next/standalone/server.js >> /home/z/my-project/prod.log 2>&1
  EXIT=$?
  echo "[$(date '+%H:%M:%S')] prod-watchdog: server exited with code $EXIT, restarting in 2s..." >> /home/z/my-project/prod.log
  sleep 2
done
