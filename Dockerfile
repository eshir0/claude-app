# syntax=docker/dockerfile:1
# ^ needed for `COPY --exclude` below (stable since Dockerfile syntax 1.19;
# `:1` always resolves to the latest stable 1.x frontend, so it's already
# new enough). Must stay the very first line of this file.

# Debian-based (not alpine): better-sqlite3 is a native addon, and this
# keeps us on glibc rather than betting on musl-compatible prebuilds. For a
# personal single-instance deployment, "definitely boots" matters more than
# shaving image size.
FROM node:24-bookworm-slim AS base

# ---- deps: install once, reused by both later stages ----------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the app + generate the Prisma client ----------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Schema-only step — no DB connection, no real secrets. This placeholder
# DATABASE_URL is never used to read/write data, only so prisma.config.ts
# (which requires the env var to be set) doesn't fail to load during
# `prisma generate`. The real runtime value comes from docker-compose.
ENV DATABASE_URL="file:/tmp/build-placeholder.db"
RUN npx prisma generate
RUN npm run build

# ---- runner: the actual production image -----------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next's standalone output only includes what its tracer can follow through
# static imports — it does NOT include public/, .next/static/, or Prisma's
# generated client (which loads its query-compiler wasm via a runtime fs
# path the tracer can't see). All three are copied in explicitly.
#
# --exclude on the standalone copy: `next build` writes a copy of whatever
# .env file(s) it finds into .next/standalone/ at build time. .dockerignore
# keeps the real .env out of the build CONTEXT sent from the host, but that
# only covers files copied FROM the host — it does nothing for a file
# created INSIDE a build stage and then carried forward by a later
# `COPY --from`, which is exactly this copy. Belt-and-suspenders: excluded
# here, and independently checked for (and failed on) below in case this
# path, another COPY line, or a future change ever reintroduces one.
COPY --exclude=.env --exclude=.env.* --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/src/generated ./src/generated

# Fails the build if any .env-like file made it into the image root despite
# the --exclude above. This is the actual enforcement — the --exclude flag
# above is a real Dockerfile feature this app was NOT able to run `docker
# build` to confirm in this environment (no Docker installed), so this
# check does not depend on trusting it worked.
RUN found="$(find . -maxdepth 1 -name '.env*' ! -name '.env.example')"; \
    if [ -n "$found" ]; then \
      echo "ERROR: an env file ended up in the deployment image — refusing to build:" >&2; \
      echo "$found" >&2; \
      exit 1; \
    fi

# The full node_modules (not the standalone-pruned copy) so `prisma migrate
# deploy` has every transitive dependency the CLI needs at container start,
# without reaching out to the network to fetch anything.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create /data now, owned by the non-root user, so the first time the named
# volume is mounted here it's already writable — a volume takes its initial
# content/ownership from what's in the image at that path.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
