#!/bin/bash

if [[ ${DATABASE_URL} ]]; then
  echo "Migrating on ${DATABASE_URL}"
  npm run prisma:migrate;
fi
#LOGGING_LEVEL=${LOGGING_LEVEL}
node --experimental-vm-modules --experimental-wasm-modules --es-module-specifier-resolution=node $@