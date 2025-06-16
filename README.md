# Cloudflare Tunnel Example

Rust web service exposed through Cloudflare Tunnel with zero inbound ports.

## Quick Start

**Prerequisites**: Docker, Deno, Cloudflare account with domain

```bash
# Deploy everything
deno task deploy:full
```

That's it! The service is now available at https://halibut.cc

## Key Commands

```bash
deno task deploy:full    # Deploy everything
deno task destroy:full   # Stop containers (keeps config)
deno task verify         # Test endpoints
deno task logs          # View logs
deno task diagnose      # Troubleshoot issues
```

## Architecture

- **Zero inbound ports** - All traffic through Cloudflare tunnel
- **Distroless containers** - Minimal attack surface
- **Non-root execution** - Security hardened
- **Path-based routing** - / and /health endpoints

## Development

```bash
deno task dev     # Run with hot reload
deno task test    # Run tests
deno task build   # Build Docker image
```

## Troubleshooting

```bash
deno task diagnose  # Run diagnostics first
deno task logs      # Check container logs
```

Common issues are documented in [USAGE.md](USAGE.md).