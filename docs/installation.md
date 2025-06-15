# Installation Guide

This guide provides detailed installation instructions for the Cloudflare Tunnel Example project across different platforms and environments.

## Prerequisites

### Required Software

| Software | Minimum Version | Purpose |
|----------|----------------|---------|
| [Docker](https://docs.docker.com/get-docker/) | 20.10+ | Container runtime |
| [Docker Compose](https://docs.docker.com/compose/install/) | 2.0+ | Multi-container orchestration |
| [Deno](https://deno.land/) | 1.40+ | Task automation and scripting |

### Platform Support

| Platform | Architecture | Support Level |
|----------|-------------|---------------|
| **Linux** | x86_64 (amd64) | ✅ Full |
| **Linux** | ARM64 | ✅ Full |
| **macOS** | Intel (x86_64) | ✅ Full |
| **macOS** | Apple Silicon (ARM64) | ✅ Full |
| **Windows** | x86_64 | ⚠️ Partial (WSL2 recommended) |

### Cloud Provider Requirements

- **Cloudflare Account**: Free tier sufficient
- **Domain**: Must be managed by Cloudflare DNS
- **Tunnel Limit**: Free tier allows up to 50 tunnels

## Installation Methods

### Method 1: Direct Installation (Recommended)

#### 1. Install Prerequisites

**Ubuntu/Debian:**
```bash
# Update package list
sudo apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose (if not included)
sudo apt install docker-compose-plugin

# Install Deno
curl -fsSL https://deno.land/install.sh | sh
echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**CentOS/RHEL/Fedora:**
```bash
# Install Docker
sudo dnf install docker docker-compose-plugin

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Install Deno
curl -fsSL https://deno.land/install.sh | sh
echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**macOS:**
```bash
# Using Homebrew
brew install docker docker-compose deno

# Or install Docker Desktop from:
# https://docs.docker.com/desktop/mac/install/
```

**Windows (WSL2):**
```powershell
# Install WSL2 if not already installed
wsl --install

# Install Docker Desktop with WSL2 backend
# Download from: https://docs.docker.com/desktop/windows/install/

# In WSL2 terminal:
curl -fsSL https://deno.land/install.sh | sh
echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### 2. Clone Repository

```bash
# Clone the repository
git clone https://github.com/your-username/cloudflare-tunnel-example.git
cd cloudflare-tunnel-example

# Verify structure
ls -la
```

#### 3. Verify Installation

```bash
# Check Docker
docker --version
docker compose version

# Check Deno
deno --version

# Test Docker access
docker run hello-world
```

### Method 2: Development Container

For VS Code users with the Dev Containers extension:

#### 1. Install VS Code Extension

```bash
# Install VS Code if not present
code --install-extension ms-vscode-remote.remote-containers
```

#### 2. Open in Container

1. Open VS Code in the project directory
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
3. Select "Dev Containers: Reopen in Container"
4. Wait for container build to complete

#### 3. Container Configuration

The development container includes:
- Rust toolchain with Cargo
- Docker-in-Docker for building images
- Deno runtime for task automation
- All necessary VS Code extensions

### Method 3: Cloud Development

#### GitHub Codespaces

1. Fork the repository on GitHub
2. Click "Code" → "Codespaces" → "Create codespace on main"
3. Wait for environment setup (2-3 minutes)
4. All tools pre-installed and configured

#### GitPod

1. Open https://gitpod.io/#https://github.com/your-username/cloudflare-tunnel-example
2. Wait for workspace initialization
3. All dependencies automatically installed

## Project Setup

### 1. Build Application

```bash
# Build the Docker image
deno task build

# Verify build success
docker images | grep cloudflare-tunnel-example
```

Expected output:
```
cloudflare-tunnel-example   latest    b816eab48230   About a minute ago   36.2MB
```

### 2. Test Local Setup

```bash
# Run local connectivity test
./test-local.sh
```

Expected output:
```
Testing local container setup...
App IP: 172.20.0.2
Testing root endpoint...
HTTP/1.1 200 OK
...
<h1>Hello World</h1><p>Cloudflare Tunnel Example - Rust Axum Service</p>
...
Local test complete!
```

### 3. Configure Domain

Update the tunnel configuration for your domain:

```bash
# Edit cloudflared/config.yml
# Replace hello.halibut.cc with your domain
sed -i 's/hello\.halibut\.cc/hello.your-domain.com/g' cloudflared/config.yml
sed -i 's/health\.halibut\.cc/health.your-domain.com/g' cloudflared/config.yml

# Update Deno task configuration
sed -i 's/hello\.halibut\.cc/hello.your-domain.com/g' deno.jsonc
```

## Cloudflare Configuration

### 1. Domain Setup

Ensure your domain is managed by Cloudflare:

1. **Add Domain to Cloudflare:**
   - Log into Cloudflare dashboard
   - Click "Add a Site"
   - Enter your domain name
   - Follow DNS setup instructions

2. **Verify DNS Management:**
   ```bash
   # Check nameservers
   dig NS your-domain.com
   
   # Should show Cloudflare nameservers:
   # your-domain.com. IN NS charlie.ns.cloudflare.com.
   # your-domain.com. IN NS kate.ns.cloudflare.com.
   ```

### 2. Tunnel Authentication

```bash
# Start authentication process
deno task tunnel:login
```

This will:
1. Open your browser to Cloudflare login
2. Prompt you to select your domain
3. Save authentication token to `cloudflared/cert.pem`

### 3. Tunnel Creation

```bash
# Create tunnel with your chosen name
deno task tunnel:create

# Verify tunnel creation
deno task tunnel:list
```

Expected output:
```
ID                                   NAME                      CREATED
550e8400-e29b-41d4-a716-446655440000 cloudflare-tunnel-example 2025-06-15T20:00:00Z
```

### 4. DNS Configuration

```bash
# Set up DNS routing
deno task tunnel:route

# Verify DNS record
dig hello.your-domain.com
```

## Deployment

### 1. Full Deployment

```bash
# Deploy complete stack
deno task deploy
```

This command:
1. Builds the Docker image
2. Starts both containers
3. Establishes tunnel connection

### 2. Verify Deployment

```bash
# Check container status
deno task ps

# View logs
deno task logs

# Test endpoints
curl https://hello.your-domain.com
curl https://health.your-domain.com
```

## Production Considerations

### 1. Resource Requirements

**Minimum System Requirements:**
- CPU: 1 core
- RAM: 512MB
- Storage: 2GB
- Network: 10Mbps upload

**Recommended for Production:**
- CPU: 2+ cores
- RAM: 2GB+
- Storage: 10GB+ SSD
- Network: 100Mbps+ upload

### 2. Security Hardening

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Configure firewall (no inbound rules needed)
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Set up log rotation
sudo tee /etc/logrotate.d/docker-containers << EOF
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    size=10M
    missingok
    delaycompress
    copytruncate
}
EOF
```

### 3. Monitoring Setup

```bash
# Install monitoring tools
sudo apt install htop iotop nethogs

# Set up log monitoring
sudo journalctl -u docker -f &

# Monitor resource usage
docker stats
```

### 4. Backup Configuration

```bash
# Backup tunnel credentials
tar -czf tunnel-backup.tar.gz cloudflared/

# Backup Docker images
docker save cloudflare-tunnel-example:latest | gzip > app-backup.tar.gz

# Store backups securely (example with rclone)
rclone copy tunnel-backup.tar.gz remote:backups/
```

## Troubleshooting Installation

### Common Issues

#### Docker Permission Errors

**Problem**: `permission denied while trying to connect to the Docker daemon`

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Re-login or run:
newgrp docker

# Test access
docker run hello-world
```

#### Deno Command Not Found

**Problem**: `deno: command not found`

**Solution:**
```bash
# Verify installation
ls -la ~/.deno/bin/

# Add to PATH
echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Or create symlink
sudo ln -s ~/.deno/bin/deno /usr/local/bin/deno
```

#### Port Already in Use

**Problem**: `port is already allocated`

**Solution:**
```bash
# Find process using port
sudo lsof -i :8080

# Stop conflicting process
sudo systemctl stop nginx  # example

# Or change port in docker-compose.yml
```

#### Build Failures

**Problem**: Rust compilation errors or Docker build failures

**Solution:**
```bash
# Clear Docker cache
docker system prune -a

# Clean Rust artifacts
cargo clean

# Rebuild from scratch
deno task clean
deno task build
```

#### Tunnel Authentication Issues

**Problem**: Browser doesn't open or authentication fails

**Solution:**
```bash
# Manual authentication
docker run -it --rm cloudflare/cloudflared:latest tunnel login

# Copy credentials manually
cp ~/.cloudflared/* ./cloudflared/

# Verify credentials
ls -la cloudflared/
```

### Performance Optimization

#### Build Performance

```bash
# Use Docker BuildKit
export DOCKER_BUILDKIT=1

# Parallel builds
docker buildx create --use --name multibuilder --driver docker-container

# Build with cache
deno task build:multiarch
```

#### Runtime Performance

```bash
# Adjust Docker resources
# Edit Docker Desktop → Settings → Resources
# Increase CPU/Memory allocation

# Monitor performance
docker stats cloudflare-tunnel-app
```

## Uninstallation

### Complete Removal

```bash
# Stop and remove containers
deno task destroy

# Remove images
docker rmi cloudflare-tunnel-example:latest

# Remove tunnel
deno task tunnel:delete

# Clean up Docker system
docker system prune -a --volumes

# Remove project directory
cd ..
rm -rf cloudflare-tunnel-example
```

### Partial Cleanup

```bash
# Stop containers only
deno task down

# Remove containers but keep images
docker compose rm

# Keep tunnel but remove DNS record
cloudflared tunnel route dns --delete cloudflare-tunnel-example hello.your-domain.com
```

## Next Steps

After successful installation:

1. **Review Configuration**: See [configuration.md](configuration.md)
2. **Explore API**: Check [api.md](api.md) for endpoint details
3. **Set Up Monitoring**: Configure log aggregation and metrics
4. **Plan Scaling**: Consider horizontal scaling strategies
5. **Security Review**: Implement additional security measures

## Support

For installation issues:

1. **Check Prerequisites**: Verify all required software is installed
2. **Review Logs**: Use `deno task logs` to check container output
3. **Test Components**: Run individual components to isolate issues
4. **Community Support**: Check project issues on GitHub
5. **Documentation**: Review all documentation files in `/docs`