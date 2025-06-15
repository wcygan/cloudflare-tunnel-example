# PLAN.md - Cloudflare Tunnel Example

## Project Overview

Create a production-ready Rust Axum web service exposed through Cloudflare Tunnel with no inbound ports, using containerized deployment and Deno-based task automation.

## Architecture

```
Client → Cloudflare Edge → Tunnel (outbound-only) → Docker Container (Axum)
```

- **Axum service**: Minimal Rust web server responding "Hello World"
- **Cloudflare Tunnel**: Secure outbound-only connection to Cloudflare edge
- **Docker**: Multi-stage build with distroless runtime image
- **Deno tasks**: Cross-platform development workflow automation

## Task Breakdown

### Phase 1: Core Service Implementation
1. **Create Rust Axum service**
   - Initialize Cargo project with Axum dependencies
   - Implement "Hello World" endpoint
   - Configure for container deployment (bind to 0.0.0.0:8080)

2. **Multi-stage Dockerfile**
   - Builder stage with Rust toolchain and build caching
   - Runtime stage with distroless image (gcr.io/distroless/cc-debian12)
   - Non-root user (1000:1000), read-only filesystem
   - Final image ~10MB

3. **Docker Compose configuration**
   - Axum app container with internal networking
   - Cloudflared container with tunnel configuration
   - Volume mounts for tunnel credentials
   - No exposed ports on host

### Phase 2: Cloudflare Tunnel Setup
4. **Tunnel configuration**
   - Create `cloudflared/config.yml` with ingress rules
   - Set up hostname routing (hello.example.com → app:8080)
   - Configure credentials file mounting

5. **DNS and routing**
   - Tunnel creation and DNS record setup
   - Authenticated origin pulls configuration
   - WAF and security settings

### Phase 3: Development Workflow
6. **Deno task automation (deno.jsonc)**
   - Build tasks: multi-arch Docker builds
   - Tunnel tasks: login, create, route, init
   - Runtime tasks: up, down, logs
   - Composite tasks: deploy, destroy

7. **Security hardening**
   - Container security: capabilities drop, seccomp, non-root
   - Network isolation: internal Docker network
   - Cloudflare security: WAF, authenticated origin pulls
   - HTTP security headers in Axum middleware

### Phase 4: Documentation and Testing
8. **Documentation**
   - README with quick start guide
   - Security checklist and best practices
   - Performance notes and scaling guidance

9. **Testing and validation**
   - Local development testing
   - Production deployment verification
   - Performance baseline establishment

## File Structure

```
cloudflare-tunnel-example/
├── PLAN.md                 # This file
├── README.md              # Quick start guide
├── deno.jsonc             # Task automation
├── Cargo.toml             # Rust dependencies
├── Dockerfile             # Multi-stage container build
├── docker-compose.yml     # Service orchestration
├── src/
│   └── main.rs           # Axum web service
└── cloudflared/
    ├── config.yml        # Tunnel configuration
    └── credentials/      # Tunnel credentials (gitignored)
```

## Success Criteria

- [ ] Axum service responds with "Hello World" at localhost:8080
- [ ] Docker build produces minimal (~10MB) container image
- [ ] Multi-arch build works (linux/amd64, linux/arm64)
- [ ] Cloudflare tunnel routes traffic securely with no inbound ports
- [ ] Deno tasks provide complete development workflow
- [ ] Security hardening implemented (non-root, read-only, WAF)
- [ ] Service handles concurrent traffic efficiently
- [ ] Documentation enables easy replication

## Key Technologies

- **Backend**: Rust + Axum (async web framework)
- **Container**: Docker multi-stage with distroless runtime
- **Networking**: Cloudflare Tunnel (zero-trust access)
- **Automation**: Deno tasks (cross-platform scripting)
- **Security**: Container hardening + Cloudflare WAF

## Performance Targets

- Container startup time: <5 seconds
- Memory usage: <50MB total
- Request throughput: >10k req/s for static content
- Image size: <15MB compressed

This plan delivers a production-ready, secure, and maintainable web service deployment pattern using modern DevOps practices.