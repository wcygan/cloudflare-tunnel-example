# Cloudflare Tunnel Configuration

This directory contains the Cloudflare Tunnel configuration files.

## Structure

- `config.yml` - Tunnel ingress rules and routing configuration
- `credentials/` - Tunnel credentials (created by `cloudflared tunnel create`)
  - This directory is gitignored for security
  - Credentials are generated when you run `deno task tunnel:create`

## Setup Instructions

1. Authenticate with Cloudflare:
   ```bash
   deno task tunnel:login
   ```

2. Create the tunnel:
   ```bash
   deno task tunnel:create
   ```

3. Configure DNS routing:
   ```bash
   deno task tunnel:route
   ```

## Configuration Details

The `config.yml` file defines:
- Hostname routing (hello.example.com → app:8080)
- Health check subdomain (health.hello.example.com → app:8080/health)
- Origin request settings (timeouts, keep-alive, etc.)
- Catch-all 404 rule for unmatched requests

## Security Notes

- Credentials are stored in `credentials/` and must never be committed
- Internal traffic uses HTTP (TLS termination at Cloudflare edge)
- The tunnel runs with no inbound ports exposed on the host