# syntax=docker/dockerfile:1

# Builder stage with cargo-chef for dependency caching
FROM rust:1.83-slim AS chef
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*
RUN cargo install cargo-chef --locked
WORKDIR /app

# Planner stage - prepare recipe for dependency caching
FROM chef AS planner
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo chef prepare --recipe-path recipe.json

# Builder stage - build dependencies then application
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json

# Build dependencies (cached unless Cargo.toml changes)
RUN cargo chef cook --release --recipe-path recipe.json

# Build application
COPY Cargo.toml Cargo.lock* ./
COPY src ./src

# Build with optimizations for size
ENV CARGO_PROFILE_RELEASE_LTO=true
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL="z"
ENV CARGO_PROFILE_RELEASE_STRIP=true

# Enable BuildKit cache mounts for better caching
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo build --release && \
    cp /app/target/release/cloudflare-tunnel-example /app/cloudflare-tunnel-example

# Runtime stage - minimal distroless image
FROM gcr.io/distroless/cc-debian12:latest AS runtime

# Create non-root user and group (UID/GID 1000)
USER 1000:1000

# Copy the binary from builder
COPY --from=builder --chown=1000:1000 /app/cloudflare-tunnel-example /app/cloudflare-tunnel-example

# Set working directory
WORKDIR /app

# Expose port (documentation only, not binding)
EXPOSE 8080

# Run the binary
ENTRYPOINT ["/app/cloudflare-tunnel-example"]