# HEAVIX — Production Dockerfile
# Multi-stage build: build the Next.js standalone app, then copy to a slim runtime image.
#
# Build: docker build -t heavix .
# Run:   docker run -p 3000:3000 --env-file .env.production heavix
#
# STEP 11.50 FIX: pinned Bun version + non-root user

# ── Stage 1: Build ──
# STEP 11.50 FIX: pin Bun version for reproducible builds
FROM oven/bun:1.3.14 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --ignore-scripts

# Copy source
COPY . .

# Generate Prisma clients
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV STORE_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN bunx prisma generate --schema=prisma/schema.prisma
RUN bunx prisma generate --schema=prisma/store/schema.prisma

# Build Next.js (standalone output)
RUN bun run build

# ── Stage 2: Runtime ──
# STEP 11.50 FIX: pin Bun version for reproducible builds
FROM oven/bun:1.3.14-slim AS runtime

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Runtime backup endpoint requires PostgreSQL client tools. Keep backups on
# the named Compose volume and make the mount writable by the non-root user.
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash postgresql-client \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/backups /app/scripts \
    && chown -R bun:bun /app/backups /app/scripts

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma files for database migrations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/src/lib/generated ./src/lib/generated

# Copy package.json and the explicitly supported operator backup script.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts/backup.sh ./scripts/backup.sh
RUN chown bun:bun ./scripts/backup.sh && chmod 0750 ./scripts/backup.sh

# STEP 11.50 FIX: run as non-root user (oven/bun images include a 'bun' user)
USER bun

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Start the application
CMD ["bun", "server.js"]
