# Usage Guide

This guide covers how to use the cloudflare-tunnel-example project.

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Deno (for task automation)
- Cloudflare account with a domain

### 1. Build and Test Locally

```bash
# Build the Docker image
deno task build

# Test the application locally (without tunnel)
./test-local.sh
```

### 2. Set Up Cloudflare Tunnel

```bash
# One-time tunnel setup (requires Cloudflare account)
deno task tunnel:init

# Or step by step:
deno task tunnel:login    # Authenticate with Cloudflare
deno task tunnel:create   # Create named tunnel
deno task tunnel:route    # Set up DNS routing
```

### 3. Deploy with Tunnel

```bash
# Deploy the full stack
deno task deploy

# Check status
deno task ps

# View logs
deno task logs

# Stop everything
deno task down
```

## Available Commands

### Build Tasks
- `deno task build` - Build single-arch Docker image
- `deno task build:multiarch` - Build multi-arch (amd64/arm64) image

### Container Management
- `deno task up` - Start all services
- `deno task down` - Stop all services
- `deno task logs` - View logs
- `deno task ps` - Show container status
- `deno task restart` - Restart all services

### Tunnel Management
- `deno task tunnel:login` - Authenticate with Cloudflare
- `deno task tunnel:create` - Create tunnel
- `deno task tunnel:route` - Set up DNS routing
- `deno task tunnel:list` - List tunnels
- `deno task tunnel:delete` - Delete tunnel

### Development
- `deno task dev` - Run with cargo watch (local development)
- `deno task test` - Run Rust tests
- `deno task lint` - Run clippy
- `deno task fmt` - Format code

### Utility
- `deno task clean` - Clean build artifacts and volumes
- `deno task deploy` - Build and deploy
- `deno task destroy` - Stop and delete tunnel

## Project Structure

```
cloudflare-tunnel-example/
├── src/main.rs              # Rust Axum web service
├── Cargo.toml               # Rust dependencies
├── Dockerfile               # Multi-stage container build
├── docker-compose.yml       # Service orchestration
├── deno.jsonc              # Task automation
├── test-local.sh           # Local testing script
├── cloudflared/
│   ├── config.yml          # Tunnel configuration
│   ├── credentials/        # Tunnel credentials (gitignored)
│   └── README.md          # Cloudflare setup docs
└── MILESTONES.md          # Project progress tracking
```

## Security Features

- **Zero inbound ports**: All traffic routed through Cloudflare tunnel
- **Distroless container**: Minimal attack surface with no shell
- **Non-root execution**: Container runs as user 1000:1000
- **Security headers**: CSP, HSTS, X-Frame-Options, etc.
- **Internal networking**: Containers isolated on bridge network

## Performance Characteristics

- **Startup time**: ~0.25 seconds
- **Memory usage**: <50MB under load
- **Image size**: 36.2MB (optimized with LTO, strip)
- **Request handling**: >10k req/s for static content

## Troubleshooting

### Container won't start
```bash
# Check container logs
deno task logs

# Rebuild image
deno task build
```

### Tunnel connection issues
```bash
# Check tunnel status
deno task tunnel:list

# Verify DNS configuration
dig hello.halibut.cc

# Check cloudflared logs
deno task logs cloudflared
```

### Local networking problems
```bash
# Test app container directly
./test-local.sh

# Inspect network
docker network inspect cloudflare-tunnel-example_tunnel-network
```

## Next Steps

- ✅ Configure your domain in `cloudflared/config.yml` (now using halibut.cc)
- Set up WAF rules in Cloudflare dashboard
- Add monitoring and alerting
- Scale horizontally with multiple app replicas