#!/bin/bash
trap "" SIGHUP SIGTERM SIGPIPE
cd /home/z/my-project
export DATABASE_URL="postgresql://heavix@localhost:5432/heavix?schema=public"
export PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH"
export NODE_OPTIONS="--max-old-space-size=384 --max-semi-space-size=64"
while true; do
  echo "[$(date '+%H:%M:%S')] watchdog: starting next dev..." >> /home/z/my-project/dev.log
  node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  EXIT=$?
  echo "[$(date '+%H:%M:%S')] watchdog: next dev exited with code $EXIT, restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
