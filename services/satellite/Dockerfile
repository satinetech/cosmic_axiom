# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# satellite
# ---------------------------------------------------------------------------
# node:20-slim, not Alpine. Alpine is musl, which means Prisma needs an explicit
# musl binaryTarget and node-canvas has no prebuilt binary -- both are avoidable
# classes of bug for a saving that does not matter here.
# ---------------------------------------------------------------------------

FROM node:20-slim AS build
WORKDIR /app

# Dependency manifests first, so editing source does not reinstall the world.
COPY package.json package-lock.json ./
RUN npm ci


FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Source first, then node_modules -- deliberately in that order. .dockerignore
# excludes node_modules from the context, but if that ever stops being true, a
# host node_modules copied over the built one would replace the Prisma engine
# and any native build with a laptop's. Copying it last makes that impossible
# rather than merely unlikely.
COPY . .
COPY --from=build /app/node_modules ./node_modules

# The base image already provides an unprivileged `node` user.
USER node

EXPOSE 3005

# Uses the unauthenticated /healthz probe. Node 20 ships fetch, so this needs no
# curl or wget in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3005/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# node runs as PID 1 and receives SIGTERM directly. It installs its own signal
# handlers (src/utils/lifecycle.js), so no init shim is needed to drain cleanly.
CMD ["node", "src/index.js"]
