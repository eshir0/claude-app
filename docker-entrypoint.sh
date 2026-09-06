#!/bin/sh
set -e

# Uses the CLI already installed in node_modules — never `npx` here, which
# can reach out to the registry. If migrations fail, this script exits
# non-zero and `node server.js` below never runs: the container must not
# come up serving traffic against a schema it doesn't match.
node_modules/.bin/prisma migrate deploy

exec node server.js
