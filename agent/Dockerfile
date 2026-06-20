# syntax=docker/dockerfile:1.7
#
# VPS Agent (Go 1.25) production image.
# Multi-stage build: Go toolchain in builder, minimal Ubuntu 24.04 runtime
# (libc is required because the agent uses creack/pty -> CGO_ENABLED=1).
#
# Build:
#   docker build -t vps-agent:dev --build-arg VERSION=dev --build-arg COMMIT=local .
# Run:
#   docker run --rm -v $(pwd)/config.json:/app/config.json:ro vps-agent:dev
#
# Coolify notes:
#   - The container runs as UID:GID 65534:65534 (nobody). The agent only needs
#     read access to /app/config.json and outbound network for gRPC.
#   - Mount the host's config.json read-only at /app/config.json.
#   - No SSH/screen/X11 in this image; headless screenshot is the agent's
#     default path and falls back gracefully when no display is attached.

# ---- builder ----
FROM golang:1.25-alpine AS builder
WORKDIR /src

# Cache module downloads in a separate layer so source edits don't bust them.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG VERSION=dev
ARG COMMIT=unknown
ENV CGO_ENABLED=1
# -trimpath: reproducible builds (no local fs paths baked into binary).
# -s -w:    strip symbol table + debug info (smaller binary).
# -X:       inject version/commit into main package vars.
RUN go build -trimpath \
    -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
    -o /out/vps-agent .

# ---- runtime ----
FROM ubuntu:24.04 AS runtime

# ca-certificates: required for TLS to Coolify / backend gRPC endpoint.
# --no-install-recommends keeps the layer small; rm -rf /var/lib/apt/lists/*
# prevents apt cache from bloating the final image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /out/vps-agent /app/vps-agent

# nobody:nobody (UID/GID 65534 on Debian/Ubuntu). Rootless execution.
USER 65534:65534

# Config is provided at runtime via mount or env (config.json path is
# configurable in the agent; default is ./config.json relative to CWD).
ENTRYPOINT ["/app/vps-agent"]
