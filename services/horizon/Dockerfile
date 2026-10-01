# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# horizon
# ---------------------------------------------------------------------------
# node:20-slim, not Alpine. Alpine is musl, which means Prisma needs an explicit
# musl binaryTarget and node-canvas has no prebuilt binary -- both are avoidable
# classes of bug for a saving that does not matter here.
# ---------------------------------------------------------------------------

FROM node:20-slim AS build
WORKDIR /app

# Puppeteer must not download a browser: the runtime stage supplies Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Dependency manifests first, so editing source does not reinstall the world.
COPY package.json package-lock.json ./
RUN npm ci


# Typst, for the optional Typst report renderer (REPORT_RENDERER=typst). A
# static musl binary, fetched in its own stage so curl never reaches the
# runtime image, and pinned by version and per-architecture sha256 -- the
# release's own published digests. Keep TYPST_VERSION in step with
# test/golden/TYPST_VERSION and the CI workflow.
FROM node:20-slim AS typst
ARG TARGETARCH
ARG TYPST_VERSION=0.15.1
ARG TYPST_SHA256_AMD64=a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c
ARG TYPST_SHA256_ARM64=5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "${TARGETARCH:-amd64}" in \
        amd64) arch=x86_64;  sum="$TYPST_SHA256_AMD64" ;; \
        arm64) arch=aarch64; sum="$TYPST_SHA256_ARM64" ;; \
        *) echo "no pinned Typst build for ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/typst.tar.xz \
        "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${arch}-unknown-linux-musl.tar.xz"; \
    echo "${sum}  /tmp/typst.tar.xz" | sha256sum -c -; \
    tar -xJf /tmp/typst.tar.xz -C /tmp; \
    install -m 0755 "/tmp/typst-${arch}-unknown-linux-musl/typst" /usr/local/bin/typst; \
    typst --version


FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# horizon renders PDFs with Puppeteer and charts with node-canvas.
#
# Chromium comes from the distribution rather than Puppeteer's own download:
# the download is ~400 MB into an image layer, and a build that reaches out to
# storage.googleapis.com is a build that fails when that is unreachable.
# PUPPETEER_EXECUTABLE_PATH points the library at the system browser, so no
# application code changes.
#
# The fonts are not optional. Without them Chromium renders CJK and symbol
# glyphs as boxes, and a report is the last place to discover that.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        fonts-noto-core \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Only used when REPORT_RENDERER=typst. The renderer ignores system fonts so
# output is identical on every host; point TYPST_FONT_PATHS at a font
# directory (for example /usr/share/fonts/opentype/noto for CJK) to add some.
COPY --from=typst /usr/local/bin/typst /usr/local/bin/typst

# Source first, then node_modules -- deliberately in that order. .dockerignore
# excludes node_modules from the context, but if that ever stops being true, a
# host node_modules copied over the built one would replace the Prisma engine
# and any native build with a laptop's. Copying it last makes that impossible
# rather than merely unlikely.
COPY . .
COPY --from=build /app/node_modules ./node_modules

# horizon writes rendered PDFs here. It is created and owned before the user
# drops, because an unprivileged process cannot mkdir in a root-owned /app.
RUN mkdir -p generated && chown node:node generated

# The base image already provides an unprivileged `node` user.
USER node

EXPOSE 3006

# Uses the unauthenticated /healthz probe. Node 20 ships fetch, so this needs no
# curl or wget in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3006/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# node runs as PID 1 and receives SIGTERM directly. It installs its own signal
# handlers (src/utils/lifecycle.js), so no init shim is needed to drain cleanly.
CMD ["node", "src/index.js"]
