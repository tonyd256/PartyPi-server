#!/bin/sh

NODE_BIN="/opt/node/bin"
APP_DIR="/home/pi/app"
OUT="/home/pi/partypi.log"

export PATH=$NODE_BIN:$PATH
forever start --minUptime 5000 --spinSleepTime 2000 --sourceDir $APP_DIR -o $OUT -e $OUT app.js
