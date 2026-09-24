#!/bin/bash
cd /home/z/my-project
export DATABASE_URL="postgresql://heavix@localhost:5432/heavix?schema=public"
export PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH"
while true; do
  echo "[$(date '+%H:%M:%S')] starting next dev..." >> /home/z/my-project/dev.log
  node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date '+%H:%M:%S')] next dev exited with code $?, restarting in 3s..." >> /home/z/my-project/dev.log
  sleep 3
done
