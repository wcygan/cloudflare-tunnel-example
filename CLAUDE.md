# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A production-ready Rust Axum web service exposed through Cloudflare Tunnel with zero inbound ports. The architecture uses containerized deployment with multi-stage Docker builds, distroless runtime images, and Deno-based task automation for the complete development lifecycle.

## Essential Commands

All project operations are managed through Deno tasks defined in `deno.jsonc`:

### Core Development
```bash
# Build multi-arch Docker image
deno task build

# Start development environment
deno task up

# Stop all services
deno task down

# View logs from both containers
deno task logs
```

### Cloudflare Tunnel Management
```bash
# One-time tunnel setup (auth + DNS)
deno task tunnel:init

# Individual tunnel operations
deno task tunnel:login    # Authenticate with Cloudflare
deno task tunnel:create   # Create named tunnel
deno task tunnel:route    # Set up DNS routing
```

### Deployment Workflow
```bash
# Complete deployment pipeline
deno task deploy         # build → push → up

# Clean teardown
deno task destroy        # down → delete tunnel
```

## Architecture & Key Components

### Service Architecture
```
Client → Cloudflare Edge → Tunnel (outbound QUIC/WSS) → Docker Container (Axum:8080)
```

**Security Model**: Zero inbound ports on host, all traffic routed through Cloudflare's edge with WAF protection and authenticated origin pulls.

### Container Strategy
- **Multi-stage Dockerfile**: Rust builder → distroless runtime (~10MB final image)
- **Security hardening**: Non-root user (1000:1000), read-only filesystem, capabilities dropped
- **Networking**: Internal Docker bridge, no host port exposure

### Key Files
- `src/main.rs` - Axum web service (binds to 0.0.0.0:8080 for container access)
- `Dockerfile` - Multi-stage build with cargo caching and distroless runtime
- `docker-compose.yml` - Service orchestration with internal networking
- `cloudflared/config.yml` - Tunnel ingress rules and hostname routing
- `deno.jsonc` - Complete task automation for build/deploy/manage lifecycle

## Development Patterns

### Container Build Optimization
- Uses cargo-chef for dependency caching in builder stage
- BuildKit cache mounts for registry and git dependencies
- Multi-architecture builds (linux/amd64, linux/arm64) via buildx

### Tunnel Configuration
- Credentials mounted as volume from `cloudflared/` directory
- Hostname routing configured in `config.yml` (hostname → service mapping)
- DNS records automatically managed via `cloudflared tunnel route dns`

### Security Implementation
- Distroless base image eliminates shell and package manager attack surface
- Container runs as non-root with minimal capabilities
- Cloudflare provides DDoS protection, WAF, and TLS termination
- HTTP security headers implemented in Axum middleware

## Performance Characteristics

**Targets**: <5s startup, <50MB memory, >10k req/s static content, <15MB image size

The Tokio event loop + Axum combination can handle ~100k req/s on single core for static responses. Cloudflare edge caching reduces origin load significantly. Horizontal scaling achieved by running multiple `app` container replicas behind the same tunnel.