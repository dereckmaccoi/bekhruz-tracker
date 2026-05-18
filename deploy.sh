#!/bin/bash
set -e

echo "=== Bekhruz Tracker Deploy ==="

# 1. Build frontend
cd /home/bekhruz/tracker/client
npm install
npm run build

# 2. Install backend deps
cd /home/bekhruz/tracker/server
npm install

# 3. Restart backend service
sudo systemctl restart bekhruz-tracker

echo "=== Deploy complete ==="
echo "Frontend: /home/bekhruz/tracker/client/dist"
echo "Backend:  systemctl status bekhruz-tracker"
