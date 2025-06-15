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

**CRITICAL:** Follow these steps in exact order for successful tunnel setup:

```bash
# Step 1: Authenticate with Cloudflare (creates cert.pem)
deno task tunnel:login

# Step 2: Create named tunnel (creates credentials JSON)
deno task tunnel:create

# Step 3: Set up DNS routing for both domains
deno task tunnel:route

# Alternative: One-time complete setup
deno task tunnel:init
```

**Important Configuration Requirements:**
- Tunnel credentials must be in `cloudflared/credentials/` directory
- Certificate must be in `cloudflared/cert.pem`
- Config must use tunnel ID, not tunnel name
- Docker Compose must mount both credentials and certificate

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

## Milestone-Driven Development

### Before Starting Work

**ALWAYS** review `MILESTONES.md` to understand:
- Current project phase and overall progress
- Which checkpoints are completed vs pending
- Dependencies between milestones
- Next immediate actions and priorities

### Milestone Review Process

1. **Check Current Status**: Look at the "Current Status Overview" section in `MILESTONES.md`
2. **Identify Next Checkpoint**: Find the next pending checkpoint with no unmet dependencies
3. **Review Deliverables**: Understand exactly what needs to be completed
4. **Validate Success Criteria**: Ensure you know how to measure completion
5. **Check for Blockers**: Address any identified blockers before starting work

### When Completing Milestones

1. **Update Milestone Status**: Mark checkpoint as completed in `MILESTONES.md`
2. **Document Actual Effort**: Record time spent vs estimated effort
3. **Record Lessons Learned**: Note any challenges or insights for future reference
4. **Update Next Steps**: Specify immediate actions needed for the next checkpoint
5. **Review Dependencies**: Ensure dependent checkpoints can now proceed

### Milestone Completion Workflow

```bash
# After completing work on a checkpoint:
# 1. Test all deliverables meet success criteria
# 2. Update MILESTONES.md with completion status
# 3. Commit changes with clear milestone reference
git add .
git commit -m "Complete Checkpoint X.Y: [Milestone Name]

- All deliverables implemented and tested
- Success criteria validated
- [Brief summary of key accomplishments]"
```

### Progress Tracking

The `MILESTONES.md` file serves as the single source of truth for:
- **Project timeline**: What should be done when
- **Dependency management**: What must be completed before starting new work
- **Risk tracking**: Current blockers and mitigation strategies
- **Effort estimation**: Actual vs planned time for future planning
- **Knowledge capture**: Lessons learned throughout development

**Important**: Always update `MILESTONES.md` when completing checkpoints to maintain accurate project status for future development sessions.

## Troubleshooting Guide

### Common Tunnel Setup Issues

This section documents the exact issues we encountered and their solutions:

#### Issue 1: "tunnel credentials file not found"

**Problem:** Cloudflared container exits with error "tunnel credentials file not found"

**Root Cause:** Tunnel credentials JSON file was in wrong location (`cloudflared/` instead of `cloudflared/credentials/`)

**Solution:**
```bash
# Move credentials to correct location
mv cloudflared/*.json cloudflared/credentials/

# Verify location
ls -la cloudflared/credentials/
# Should show: 90b6148f-e83f-4749-8649-a1cad20715aa.json
```

#### Issue 2: "Cannot determine default origin certificate path"

**Problem:** Cloudflared fails with "No file cert.pem in [~/.cloudflared ~/.cloudflare-warp]"

**Root Cause:** Origin certificate not mounted in Docker container

**Solution:** Update `docker-compose.yml` volumes section:
```yaml
volumes:
  - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
  - ./cloudflared/credentials:/etc/cloudflared/credentials:ro
  - ./cloudflared/cert.pem:/home/nonroot/.cloudflared/cert.pem:ro  # ADD THIS LINE
```

#### Issue 3: Invalid tunnel configuration

**Problem:** Tunnel config validation fails with ingress rule errors

**Root Cause:** Using tunnel name instead of tunnel ID in `config.yml`

**Solution:** Update `cloudflared/config.yml`:
```yaml
# WRONG:
tunnel: cloudflare-tunnel-example

# CORRECT:
tunnel: 90b6148f-e83f-4749-8649-a1cad20715aa
credentials-file: /etc/cloudflared/credentials/90b6148f-e83f-4749-8649-a1cad20715aa.json
```

#### Issue 4: Health subdomain 404 errors

**Problem:** `health.halibut.cc` returns 404 instead of health check

**Root Cause:** DNS record not created for health subdomain

**Solution:**
```bash
# Add DNS record for health subdomain
docker run --rm -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel route dns 90b6148f-e83f-4749-8649-a1cad20715aa health.halibut.cc
```

### Verification Steps

After fixing tunnel issues, verify with these commands:

```bash
# 1. Check tunnel connections
docker logs cloudflare-tunnel | grep "Registered tunnel connection"
# Should show 4 active connections

# 2. Test endpoints
curl -I https://hello.halibut.cc
curl -I https://health.halibut.cc/health

# 3. Verify DNS records
dig hello.halibut.cc
dig health.halibut.cc

# 4. Check container status
docker ps
# Both cloudflare-tunnel-app and cloudflare-tunnel should be running
```

### File Structure Requirements

For tunnel to work correctly, ensure this exact structure:

```
cloudflared/
├── config.yml                                    # Tunnel ingress rules
├── cert.pem                                      # Origin certificate
├── credentials/
│   └── 90b6148f-e83f-4749-8649-a1cad20715aa.json # Tunnel credentials
└── README.md
```

### Docker Compose Requirements

Ensure these volume mounts are present:

```yaml
cloudflared:
  volumes:
    - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
    - ./cloudflared/credentials:/etc/cloudflared/credentials:ro
    - ./cloudflared/cert.pem:/home/nonroot/.cloudflared/cert.pem:ro
```