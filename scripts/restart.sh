#!/bin/sh

NODE_BIN="/opt/node/bin"
APP_DIR="/home/pi/app"
OUT="/home/pi/partypi.log"

export PATH=$NODE_BIN:$PATH
forever restart --sourceDir $APP_DIR app.js
