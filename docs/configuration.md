# Configuration Guide

This document covers all configuration options for the Cloudflare Tunnel Example project.

## Environment Variables

### Application Configuration

| Variable | Description | Default | Required | Example |
|----------|-------------|---------|----------|---------|
| `RUST_LOG` | Logging level for the Rust application | `info` | No | `debug`, `info`, `warn`, `error` |

**Example:**
```bash
# Set debug logging
export RUST_LOG=debug
deno task up
```

### Cloudflared Configuration

| Variable | Description | Default | Required | Example |
|----------|-------------|---------|----------|---------|
| `TUNNEL_CONFIG` | Path to cloudflared configuration file | `/etc/cloudflared/config.yml` | No | `/custom/path/config.yml` |

## Cloudflared Configuration (config.yml)

The main tunnel configuration is in `cloudflared/config.yml`:

```yaml
# Cloudflare Tunnel configuration
tunnel: cloudflare-tunnel-example

# Ingress rules define how to route traffic
ingress:
  # Main application route
  - hostname: hello.halibut.cc
    service: http://app:8080
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      keepAliveConnections: 10
      keepAliveTimeout: 30s
  
  # Health check endpoint
  - hostname: health.halibut.cc
    service: http://app:8080
    path: /health
    originRequest:
      noTLSVerify: true
  
  # Catch-all rule (required)
  - service: http_status:404
```

### Tunnel Settings

#### Tunnel Name
```yaml
tunnel: cloudflare-tunnel-example
```
- **Purpose**: Identifier for your tunnel in Cloudflare
- **Customization**: Change to match your project name
- **Note**: Must match the name used in `deno task tunnel:create`

#### Ingress Rules

Ingress rules are processed in order. The first matching rule is used.

**Hostname Routing:**
```yaml
- hostname: hello.halibut.cc
  service: http://app:8080
```
- **hostname**: The public domain that will route to your service
- **service**: Internal container address (Docker service name + port)

**Path-based Routing:**
```yaml
- hostname: health.halibut.cc
  service: http://app:8080
  path: /health
```
- **path**: Optional path matching for specific endpoints

**Catch-all Rule:**
```yaml
- service: http_status:404
```
- **Required**: Must be the last rule
- **Purpose**: Handles requests that don't match other rules

#### Origin Request Settings

Configure how cloudflared communicates with your origin server:

```yaml
originRequest:
  noTLSVerify: true          # Disable TLS verification for internal traffic
  connectTimeout: 30s        # Connection timeout
  keepAliveConnections: 10   # Number of keep-alive connections
  keepAliveTimeout: 30s      # Keep-alive timeout
```

**Advanced Options:**
```yaml
originRequest:
  # HTTP settings
  httpHostHeader: custom-host.local
  originServerName: internal.service
  
  # Timeout settings
  connectTimeout: 30s
  tlsTimeout: 10s
  tcpKeepAlive: 30s
  
  # Connection pooling
  keepAliveConnections: 10
  keepAliveTimeout: 30s
  
  # Proxy settings
  proxyAddress: proxy.internal:8080
  proxyPort: 8080
  proxyType: http
  
  # TLS settings
  noTLSVerify: true
  caPool: /path/to/ca-pool.pem
  
  # Load balancing
  lbPool: main-pool
  
  # Chunked transfer
  disableChunkedEncoding: false
```

## Docker Compose Configuration

### Service Configuration

**Application Service:**
```yaml
app:
  build:
    context: .
    dockerfile: Dockerfile
  image: cloudflare-tunnel-example:latest
  container_name: cloudflare-tunnel-app
  restart: unless-stopped
  networks:
    - tunnel-network
  environment:
    - RUST_LOG=info
```

**Cloudflared Service:**
```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  container_name: cloudflare-tunnel
  restart: on-failure
  command: tunnel run
  networks:
    - tunnel-network
  volumes:
    - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
    - ./cloudflared/credentials:/etc/cloudflared/credentials:ro
  environment:
    - TUNNEL_CONFIG=/etc/cloudflared/config.yml
  depends_on:
    app:
      condition: service_started
```

### Network Configuration

**Custom Bridge Network:**
```yaml
networks:
  tunnel-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

**Benefits:**
- Isolated network for containers
- Service discovery by container name
- Predictable IP addressing

## Dockerfile Configuration

### Build Arguments

The Dockerfile supports build-time configuration:

```dockerfile
# Build optimizations
ENV CARGO_PROFILE_RELEASE_LTO=true
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL="z"
ENV CARGO_PROFILE_RELEASE_STRIP=true
```

**Customization Options:**
```bash
# Custom optimization level
docker build --build-arg OPT_LEVEL="s" .

# Debug build
docker build --build-arg CARGO_PROFILE_RELEASE_DEBUG=true .
```

### Runtime Configuration

**Security Settings:**
- Base image: `gcr.io/distroless/cc-debian12:latest`
- User: `1000:1000` (non-root)
- Working directory: `/app`
- Port: `8080` (documentation only)

## Deno Task Configuration

Tasks are defined in `deno.jsonc`:

### Build Tasks
```json
{
  "build": "docker build -t cloudflare-tunnel-example:latest .",
  "build:multiarch": "docker buildx build --platform linux/amd64,linux/arm64 -t cloudflare-tunnel-example:latest ."
}
```

### Tunnel Tasks
```json
{
  "tunnel:login": "docker run --rm -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel login",
  "tunnel:create": "docker run --rm -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel create cloudflare-tunnel-example",
  "tunnel:route": "docker run --rm -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel route dns cloudflare-tunnel-example hello.halibut.cc"
}
```

**Customization:**
- Change `hello.halibut.cc` to your domain
- Modify tunnel name `cloudflare-tunnel-example`
- Add additional route commands for subdomains

## Security Configuration

### Container Security

**Distroless Base Image:**
```dockerfile
FROM gcr.io/distroless/cc-debian12:latest AS runtime
```
- No shell, package manager, or unnecessary binaries
- Minimal attack surface
- Regular security updates from Google

**Non-root User:**
```dockerfile
USER 1000:1000
```
- Runs as unprivileged user
- Prevents privilege escalation
- Industry security best practice

### Network Security

**Zero Inbound Ports:**
- No `ports:` section in docker-compose.yml
- All traffic through Cloudflare tunnel
- Internal communication only via Docker network

**Internal Network Isolation:**
```yaml
networks:
  tunnel-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### HTTP Security Headers

Configured in `src/main.rs`:

```rust
headers.insert("X-Content-Type-Options", HeaderValue::from_static("nosniff"));
headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
headers.insert("X-XSS-Protection", HeaderValue::from_static("1; mode=block"));
headers.insert("Strict-Transport-Security", HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"));
headers.insert("Content-Security-Policy", HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'"));
```

## Performance Configuration

### Rust Build Optimizations

**Release Profile:**
```toml
[profile.release]
lto = true              # Link-time optimization
codegen-units = 1       # Single codegen unit for better optimization
opt-level = "z"         # Optimize for size
strip = true            # Strip debug symbols
```

**Runtime Performance:**
- Tokio async runtime with full features
- Tower middleware for request processing
- Connection keep-alive for better throughput

### Docker Build Optimization

**Multi-stage Build:**
- Builder stage: Full Rust toolchain
- Runtime stage: Distroless image
- cargo-chef for dependency caching

**Build Cache:**
```dockerfile
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo build --release
```

## Monitoring Configuration

### Logging Configuration

**Rust Application:**
```rust
tracing_subscriber::fmt()
    .with_env_filter(
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "info".into()),
    )
    .init();
```

**Log Levels:**
- `error`: Only errors
- `warn`: Warnings and errors
- `info`: General information (default)
- `debug`: Detailed debugging
- `trace`: Very verbose tracing

### Health Check Configuration

**Endpoint Configuration:**
```rust
async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "service": "cloudflare-tunnel-example",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}
```

## Customization Examples

### Adding New Routes

1. **Update Cloudflared Config:**
```yaml
ingress:
  - hostname: api.halibut.cc
    service: http://app:8080
    path: /api
```

2. **Update DNS Routing:**
```bash
deno task tunnel:route:api # Add custom task
```

3. **Add Rust Route:**
```rust
.route("/api", get(api_handler))
```

### Custom Domain Configuration

1. **Update config.yml:**
```yaml
- hostname: hello.your-domain.com
  service: http://app:8080
```

2. **Update deno.jsonc:**
```json
"tunnel:route": "... hello.your-domain.com"
```

### Environment-Specific Configuration

**Development:**
```yaml
# docker-compose.dev.yml
environment:
  - RUST_LOG=debug
  - DEV_MODE=true
```

**Production:**
```yaml
# docker-compose.prod.yml
environment:
  - RUST_LOG=warn
  - PROD_MODE=true
restart: always
```

## Troubleshooting Configuration

### Common Issues

**Tunnel Connection Failed:**
- Check domain configuration in config.yml
- Verify DNS record exists: `dig hello.halibut.cc`
- Confirm tunnel credentials are present

**Container Communication:**
- Verify containers are on same network
- Check service names match in config.yml
- Test internal connectivity: `docker exec -it app ping cloudflared`

**Performance Issues:**
- Adjust keep-alive settings
- Increase connection pool size
- Monitor resource usage: `docker stats`