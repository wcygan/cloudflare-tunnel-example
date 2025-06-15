# Cloudflare Tunnel Example

![Rust](https://img.shields.io/badge/rust-%23000000.svg?style=for-the-badge&logo=rust&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white)

A production-ready Rust Axum web service exposed through Cloudflare Tunnel with zero inbound ports. Features containerized deployment with multi-stage Docker builds, distroless runtime images, and Deno-based task automation.

## ✨ Features

- **🔒 Zero Trust Networking** - No inbound ports, all traffic routed through Cloudflare tunnel
- **🛡️ Security Hardened** - Distroless container, non-root execution, comprehensive security headers
- **⚡ High Performance** - <250ms startup, >10k req/s throughput, 36MB optimized image
- **🏗️ Production Ready** - Multi-arch builds, health checks, structured logging
- **🔧 Developer Friendly** - Automated workflows via Deno tasks, hot reload, comprehensive testing

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Deno](https://deno.land/) for task automation
- Cloudflare account with a domain

### ⚡ One-Command Deployment

```bash
git clone <repository-url>
cd cloudflare-tunnel-example

# Deploy everything (tunnel + app + verification)
deno task deploy:full
```

This single command will:
1. Set up Cloudflare tunnel authentication
2. Create tunnel and DNS records
3. Build Docker image
4. Start containers
5. Verify endpoints are working

### 🧹 One-Command Cleanup

```bash
# Stop and clean up everything
deno task destroy:full
```

### 📋 Step-by-Step (Alternative)

If you prefer manual control or troubleshooting:

```bash
# 1. Set up Cloudflare tunnel (one-time)
deno task tunnel:init

# 2. Build and deploy
deno task build
deno task up

# 3. Verify deployment
deno task verify
```

## 📁 Project Structure

```
cloudflare-tunnel-example/
├── src/main.rs              # Rust Axum web service
├── Cargo.toml               # Rust dependencies and configuration
├── Dockerfile               # Multi-stage container build
├── docker-compose.yml       # Service orchestration
├── deno.jsonc              # Task automation and scripts
├── test-local.sh           # Local connectivity testing
├── cloudflared/
│   ├── config.yml          # Tunnel ingress configuration
│   ├── credentials/        # Tunnel credentials (gitignored)
│   └── README.md          # Cloudflare setup documentation
├── docs/                   # Additional documentation
├── MILESTONES.md          # Development progress tracking
└── USAGE.md               # Detailed usage instructions
```

## 🔧 Available Commands

### 🚀 Streamlined Commands (Recommended)
- `deno task deploy:full` - **Complete deployment** (tunnel + build + deploy + verify)
- `deno task destroy:full` - **Complete cleanup** (stop + clean, preserves tunnel config)
- `deno task verify` - **Test endpoints** to ensure deployment is working

### Build & Deploy
- `deno task build` - Build Docker image
- `deno task build:multiarch` - Multi-architecture build (amd64/arm64)
- `deno task deploy` - Build and deploy services
- `deno task up` - Start all services
- `deno task down` - Stop all services

### Tunnel Management
- `deno task tunnel:init` - Complete tunnel setup (login + create + route)
- `deno task tunnel:login` - Authenticate with Cloudflare
- `deno task tunnel:create` - Create tunnel
- `deno task tunnel:route` - Configure DNS routing for both domains
- `deno task tunnel:list` - List active tunnels
- `deno task tunnel:delete` - Delete tunnel
- `deno task tunnel:cleanup` - Clean up tunnel connections

### Development
- `deno task dev` - Run with hot reload (cargo watch)
- `deno task test` - Run Rust tests
- `deno task lint` - Code linting (clippy)
- `deno task fmt` - Code formatting

### Monitoring
- `deno task ps` - Show container status
- `deno task logs` - View service logs
- `deno task restart` - Restart all services

## 🏗️ Architecture

### Service Flow
```
Internet → Cloudflare Edge → Tunnel (QUIC/WSS) → Docker Container (Axum:8080)
```

### Key Components

- **Rust Axum Service**: High-performance async web server
- **Cloudflare Tunnel**: Secure outbound-only connection to Cloudflare edge
- **Docker Multi-stage Build**: Optimized with cargo-chef caching and distroless runtime
- **Deno Task Automation**: Cross-platform development workflow management

### Security Model

- **Zero Inbound Ports**: All traffic routed through Cloudflare tunnel
- **Authenticated Origin Pulls**: Verified requests from Cloudflare edge
- **Container Hardening**: Non-root user (1000:1000), read-only filesystem
- **Security Headers**: CSP, HSTS, X-Frame-Options, and more

## 🔒 Security Features

| Feature | Implementation |
|---------|----------------|
| **Network Security** | Zero inbound ports, tunnel-only access |
| **Container Security** | Distroless base, non-root execution |
| **Web Security** | Comprehensive HTTP security headers |
| **TLS Termination** | Automatic HTTPS via Cloudflare edge |
| **DDoS Protection** | Built-in Cloudflare protection |
| **WAF Protection** | Web Application Firewall included |

## 🚀 Performance Characteristics

| Metric | Target | Achieved |
|--------|--------|----------|
| **Startup Time** | <5 seconds | ~0.25 seconds |
| **Memory Usage** | <50MB | <40MB at idle |
| **Request Throughput** | >10k req/s | >10k req/s static |
| **Image Size** | <50MB | 36.2MB |
| **Multi-arch Support** | ✅ | amd64, arm64 |

## 📖 API Endpoints

### Main Application
- **GET /** - Hello World page with security headers
- **GET /health** - Health check endpoint returning JSON status

### Security Headers Applied
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `RUST_LOG` | Logging level | `info` | No |
| `TUNNEL_CONFIG` | Cloudflared config path | `/etc/cloudflared/config.yml` | No |

### Tunnel Configuration

The tunnel configuration in `cloudflared/config.yml` defines:
- Hostname routing (hello.halibut.cc → app:8080)
- Health check subdomain (health.halibut.cc → app:8080/health)
- Origin request settings (timeouts, keep-alive)
- Catch-all 404 rule for unmatched requests

## 🧪 Testing

### Local Testing
```bash
# Test container locally
./test-local.sh

# Run Rust tests
deno task test

# Check code quality
deno task lint
deno task fmt:check
```

### Production Testing
```bash
# After deployment, test live endpoints
curl https://hello.halibut.cc
curl https://health.halibut.cc
```

## 🚨 Troubleshooting

### Common Tunnel Setup Issues

**Problem: "tunnel credentials file not found"**
```bash
# Solution: Check credentials are in the right location
ls -la cloudflared/credentials/
# Should show: 90b6148f-e83f-4749-8649-a1cad20715aa.json

# If missing, move credentials file:
mv cloudflared/*.json cloudflared/credentials/
```

**Problem: "Cannot determine default origin certificate path"**
```bash
# Solution: Ensure cert.pem is mounted correctly
ls -la cloudflared/cert.pem
# Should exist and be readable

# Check Docker Compose has both mounts:
# - ./cloudflared/cert.pem:/home/nonroot/.cloudflared/cert.pem:ro
# - ./cloudflared/credentials:/etc/cloudflared/credentials:ro
```

**Problem: "Tunnel connection failed" or exits with code 1**
```bash
# Check tunnel configuration uses tunnel ID, not name:
cat cloudflared/config.yml
# Should show: tunnel: 90b6148f-e83f-4749-8649-a1cad20715aa
# Not: tunnel: cloudflare-tunnel-example

# Get your tunnel ID:
deno task tunnel:list
```

### Container Issues
```bash
# Check container logs
deno task logs

# Rebuild image
deno task build

# Check container status
deno task ps
```

### DNS and Connectivity Issues
```bash
# Verify DNS records are set up
dig hello.halibut.cc
dig health.halibut.cc

# Test endpoints
curl -I https://hello.halibut.cc
curl -I https://health.halibut.cc/health

# Check tunnel connections
docker logs cloudflare-tunnel | grep "Registered tunnel connection"
```

### Network Issues
```bash
# Test app container directly
./test-local.sh

# Inspect Docker network
docker network inspect cloudflare-tunnel-example_tunnel-network
```

## 📚 Documentation

- [USAGE.md](USAGE.md) - Comprehensive usage guide
- [MILESTONES.md](MILESTONES.md) - Development progress and milestones
- [cloudflared/README.md](cloudflared/README.md) - Cloudflare tunnel setup
- [CHANGELOG.md](CHANGELOG.md) - Version history and changes

## 🛠️ Development

### Local Development
```bash
# Start with hot reload
deno task dev

# Run tests
deno task test

# Format code
deno task fmt
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

This project is part of the development workspace examples.

## 🤝 Support

For questions and support:
- Review the [USAGE.md](USAGE.md) guide
- Check [MILESTONES.md](MILESTONES.md) for project status
- Examine logs with `deno task logs`