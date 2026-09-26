# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# frontend
# ---------------------------------------------------------------------------
# Vite compiles to static files; nginx serves them. Nothing from the build stage
# -- node, the toolchain, the node_modules tree -- reaches the runtime image.
# ---------------------------------------------------------------------------

FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines import.meta.env.VITE_* into the bundle at BUILD time; there is no
# runtime lookup. This value is therefore compiled into the JavaScript, and an
# image built for one API origin cannot be repointed at another without being
# rebuilt. That is how Vite works rather than a choice made here, but it is easy
# to be caught out by, so it is an explicit build argument rather than a
# hardcoded constant.
#
# The default is a path rather than an origin, because the application and the
# API are served from a single origin in a container deployment: a relative
# /api needs no CORS and no knowledge of the external hostname.
#
# It has to be a prefix rather than the bare root. The SPA has client-side
# routes at /findings, /reports and /customers which collide exactly with
# satellite's API paths, so a bare-root base URL would make them ambiguous.
ARG VITE_SATELLITE_URL=/api
ENV VITE_SATELLITE_URL=$VITE_SATELLITE_URL
RUN npm run build


# nginx's own unprivileged image rather than the standard one. It runs as uid
# 101 with no root master process and listens on 8080, so the container needs no
# privilege to bind its port. The stock nginx image cannot simply be given
# `USER nginx` -- its master process writes /var/run/nginx.pid as root.
FROM nginxinc/nginx-unprivileged:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
