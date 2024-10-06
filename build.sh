#! /usr/bin/env bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

tsc
npm run scss

rm -rf build/
rm -f build.zip

mkdir build
cp -r assets build/assets
cp manifest.json build/manifest.json
cp -r dist/* build/

zip -r build.zip build/

rm -rf build/

printf "${GREEN}Done!\n${RESET}"

set +e
