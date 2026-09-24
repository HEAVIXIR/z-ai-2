#!/bin/bash
trap "" SIGHUP SIGTERM SIGPIPE
cd /home/z/my-project/download
while true; do
  echo "[$(date '+%H:%M:%S')] backup-server: starting on port 8765" >> /tmp/backup-server.log
  exec python3 -m http.server 8765 --bind 0.0.0.0 >> /tmp/backup-server.log 2>&1
  EXIT=$?
  echo "[$(date '+%H:%M:%S')] backup-server: exited with code $EXIT, restarting in 2s..." >> /tmp/backup-server.log
  sleep 2
done
