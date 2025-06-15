# Cloudflare Tunnel Troubleshooting Guide

This document captures the exact issues encountered during tunnel setup and their solutions, serving as a comprehensive reference for future debugging.

## Summary of Issues Resolved

During the initial tunnel setup, we encountered and resolved these critical issues:

1. **Tunnel credentials file not found** - Credentials in wrong directory
2. **Missing origin certificate** - Docker mount configuration incomplete  
3. **Invalid tunnel configuration** - Using tunnel name instead of ID
4. **Health subdomain 404 errors** - Missing DNS record

All issues have been resolved and both endpoints are now fully operational:
- ✅ `https://hello.halibut.cc/` - Main application
- ✅ `https://health.halibut.cc/health` - Health check endpoint

## Detailed Issue Resolution

### Issue 1: "tunnel credentials file not found"

**Error Message:**
```
tunnel credentials file not found
```

**Root Cause:**
The tunnel credentials JSON file was generated in the `cloudflared/` directory but the Docker configuration expected it in `cloudflared/credentials/`.

**Symptoms:**
- Cloudflared container exits immediately
- Docker logs show "tunnel credentials file not found"
- Container restart loop

**Solution:**
```bash
# Move credentials to correct location
mv cloudflared/90b6148f-e83f-4749-8649-a1cad20715aa.json cloudflared/credentials/

# Verify location
ls -la cloudflared/credentials/
# Should show: 90b6148f-e83f-4749-8649-a1cad20715aa.json
```

**Prevention:**
Ensure the `deno task tunnel:create` command creates credentials in the right directory, or move them after creation.

### Issue 2: "Cannot determine default origin certificate path"

**Error Message:**
```
ERR Cannot determine default origin certificate path. No file cert.pem in [~/.cloudflared ~/.cloudflare-warp ~/cloudflare-warp /etc/cloudflared /usr/local/etc/cloudflared]. You need to specify the origin certificate path by specifying the origincert option in the configuration file, or set TUNNEL_ORIGIN_CERT environment variable originCertPath=
error parsing tunnel ID: Error locating origin cert: client didn't specify origincert path
```

**Root Cause:**
The origin certificate `cert.pem` was present in the host filesystem but not mounted into the Docker container at the expected location.

**Symptoms:**
- Cloudflared fails to start
- Error about missing cert.pem file
- Cannot authenticate with Cloudflare

**Solution:**
Update `docker-compose.yml` to include the certificate mount:

```yaml
volumes:
  - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
  - ./cloudflared/credentials:/etc/cloudflared/credentials:ro
  - ./cloudflared/cert.pem:/home/nonroot/.cloudflared/cert.pem:ro  # ADD THIS LINE
```

**Prevention:**
Always ensure both credentials and certificate are mounted when configuring Docker Compose for cloudflared.

### Issue 3: Invalid tunnel configuration

**Error Message:**
```
Couldn't start tunnel error="http://app:8080/health is an invalid address, ingress rules don't support proxying to a different path on the origin service. The path will be the same as the eyeball request's path"
```

**Root Cause:**
Multiple configuration issues:
1. Using tunnel name instead of tunnel ID in `config.yml`
2. Incorrect ingress rule syntax for path-based routing

**Symptoms:**
- Tunnel fails to start after container restarts
- Configuration validation errors in logs
- Connection attempts fail

**Solution:**
Update `cloudflared/config.yml`:

```yaml
# BEFORE (incorrect):
tunnel: cloudflare-tunnel-example

# AFTER (correct):
tunnel: 90b6148f-e83f-4749-8649-a1cad20715aa
credentials-file: /etc/cloudflared/credentials/90b6148f-e83f-4749-8649-a1cad20715aa.json
```

**Prevention:**
- Always use tunnel ID from `deno task tunnel:list` output
- Specify explicit credentials-file path
- Test configuration before deployment

### Issue 4: Health subdomain 404 errors

**Error Message:**
```
HTTP/2 404 
```

**Root Cause:**
The DNS record for `health.halibut.cc` was not created during initial tunnel setup, so requests couldn't route to the tunnel.

**Symptoms:**
- Main domain `hello.halibut.cc` works correctly
- Health subdomain `health.halibut.cc` returns 404
- DNS lookups fail for health subdomain

**Solution:**
```bash
# Add DNS record for health subdomain
docker run --rm -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel route dns 90b6148f-e83f-4749-8649-a1cad20715aa health.halibut.cc
```

**Prevention:**
Ensure all subdomains mentioned in `config.yml` have corresponding DNS records created.

## Verification Checklist

After resolving tunnel issues, verify the setup with these steps:

### 1. File Structure Check
```bash
ls -la cloudflared/
# Should show:
# - config.yml
# - cert.pem
# - credentials/ (directory)
# - README.md

ls -la cloudflared/credentials/
# Should show:
# - 90b6148f-e83f-4749-8649-a1cad20715aa.json
```

### 2. Docker Configuration Check
```bash
grep -A 10 "volumes:" docker-compose.yml
# Should include all three mounts:
# - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
# - ./cloudflared/credentials:/etc/cloudflared/credentials:ro
# - ./cloudflared/cert.pem:/home/nonroot/.cloudflared/cert.pem:ro
```

### 3. Tunnel Configuration Check
```bash
grep "tunnel:" cloudflared/config.yml
# Should show: tunnel: 90b6148f-e83f-4749-8649-a1cad20715aa

grep "credentials-file:" cloudflared/config.yml
# Should show: credentials-file: /etc/cloudflared/credentials/90b6148f-e83f-4749-8649-a1cad20715aa.json
```

### 4. Container Status Check
```bash
docker ps
# Both containers should be running:
# - cloudflare-tunnel-app
# - cloudflare-tunnel

docker logs cloudflare-tunnel | grep "Registered tunnel connection"
# Should show 4 active connections to Cloudflare edge servers
```

### 5. DNS Records Check
```bash
dig hello.halibut.cc
dig health.halibut.cc
# Both should resolve to Cloudflare IP addresses
```

### 6. Endpoint Functionality Check
```bash
# Test main application
curl -I https://hello.halibut.cc
# Should return: HTTP/2 200

# Test health endpoint
curl -I https://health.halibut.cc/health
# Should return: HTTP/2 200

# Test health endpoint content
curl https://health.halibut.cc/health
# Should return JSON: {"status":"healthy","service":"cloudflare-tunnel-example","timestamp":"..."}
```

## Key Configuration Requirements

### Required File Structure
```
cloudflared/
├── config.yml                                    # Tunnel ingress rules
├── cert.pem                                      # Origin certificate (from tunnel:login)
├── credentials/
│   └── 90b6148f-e83f-4749-8649-a1cad20715aa.json # Tunnel credentials (from tunnel:create)
└── README.md
```

### Required Docker Compose Volumes
```yaml
cloudflared:
  volumes:
    - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
    - ./cloudflared/credentials:/etc/cloudflared/credentials:ro
    - ./cloudflared/cert.pem:/home/nonroot/.cloudflared/cert.pem:ro
```

### Required Tunnel Configuration
```yaml
tunnel: 90b6148f-e83f-4749-8649-a1cad20715aa  # Use tunnel ID, not name
credentials-file: /etc/cloudflared/credentials/90b6148f-e83f-4749-8649-a1cad20715aa.json

ingress:
  - hostname: hello.halibut.cc
    service: http://app:8080
  - hostname: health.halibut.cc  
    service: http://app:8080
  - service: http_status:404
```

### Required DNS Records
```bash
# Both domains must have DNS records pointing to the tunnel
hello.halibut.cc   -> tunnel.halibut.cc (CNAME)
health.halibut.cc  -> tunnel.halibut.cc (CNAME)
```

## Debugging Commands

### Container Logs
```bash
# Check cloudflared logs
docker logs cloudflare-tunnel

# Check application logs  
docker logs cloudflare-tunnel-app

# Follow logs in real-time
docker logs -f cloudflare-tunnel
```

### Tunnel Status
```bash
# List tunnels
deno task tunnel:list

# Check tunnel connections
docker logs cloudflare-tunnel | grep "Registered tunnel connection"

# Verify tunnel configuration
docker run --rm -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel info 90b6148f-e83f-4749-8649-a1cad20715aa
```

### Network Testing
```bash
# Test container connectivity
docker exec cloudflare-tunnel-app whoami  # Should show: nonroot

# Test internal network
docker network ls | grep tunnel

# Test DNS resolution
nslookup hello.halibut.cc
nslookup health.halibut.cc
```

This troubleshooting guide should help resolve similar issues in future tunnel deployments and provide a reference for maintaining the service.