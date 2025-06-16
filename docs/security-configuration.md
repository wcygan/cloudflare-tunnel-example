# Security Configuration

The Cloudflare Tunnel Example service supports configurable security headers via environment variables. This allows you to customize security policies without recompiling the application.

## Environment Variables

All security configuration can be overridden using environment variables:

### Basic Security Headers

- `SECURITY_CONTENT_TYPE_OPTIONS` - X-Content-Type-Options header (default: "nosniff")
- `SECURITY_FRAME_OPTIONS` - X-Frame-Options header (default: "DENY")  
- `SECURITY_XSS_PROTECTION` - X-XSS-Protection header (default: "1; mode=block")
- `SECURITY_REFERRER_POLICY` - Referrer-Policy header (default: "strict-origin-when-cross-origin")
- `SECURITY_PERMISSIONS_POLICY` - Permissions-Policy header (default: "geolocation=(), microphone=(), camera=()")

### HSTS Configuration

- `SECURITY_HSTS_MAX_AGE` - HSTS max-age in seconds (default: 31536000, 1 year)
- `SECURITY_HSTS_INCLUDE_SUBDOMAINS` - Include subdomains (default: true)
- `SECURITY_HSTS_PRELOAD` - Include preload directive (default: true)

### Content Security Policy

- `SECURITY_CSP_DEFAULT_SRC` - default-src directive (default: "'self'")
- `SECURITY_CSP_SCRIPT_SRC` - script-src directive (default: "'self'")
- `SECURITY_CSP_STYLE_SRC` - style-src directive (default: "'self' 'unsafe-inline'")

### Server Header

- `SERVER_HEADER` - Server header value (default: "cloudflare-tunnel-example")

## Examples

### Development Environment

For development, you might want more relaxed CSP policies:

```bash
export SECURITY_CSP_SCRIPT_SRC="'self' 'unsafe-eval'"
export SECURITY_CSP_STYLE_SRC="'self' 'unsafe-inline' https:"
export SECURITY_FRAME_OPTIONS="SAMEORIGIN"
```

### High Security Environment

For high-security environments, you might want stricter policies:

```bash
export SECURITY_FRAME_OPTIONS="DENY"
export SECURITY_HSTS_MAX_AGE="63072000"  # 2 years
export SECURITY_CSP_DEFAULT_SRC="'none'"
export SECURITY_CSP_SCRIPT_SRC="'self'"
export SECURITY_CSP_STYLE_SRC="'self'"
```

### Docker Configuration

When running in Docker, set environment variables in your docker-compose.yml:

```yaml
services:
  app:
    environment:
      - SECURITY_FRAME_OPTIONS=SAMEORIGIN
      - SECURITY_HSTS_MAX_AGE=3600
      - SECURITY_CSP_DEFAULT_SRC='self'
```

## Default Security Headers

The service applies these security headers by default:

- **X-Content-Type-Options**: nosniff
- **X-Frame-Options**: DENY
- **X-XSS-Protection**: 1; mode=block
- **Strict-Transport-Security**: max-age=31536000; includeSubDomains; preload
- **Content-Security-Policy**: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Permissions-Policy**: geolocation=(), microphone=(), camera=()

## Validation

The service validates all header values at startup. Invalid values will cause the service to fail to start with a clear error message.

## Security Considerations

- Always test configuration changes in a non-production environment first
- The default configuration is designed for maximum security - only relax policies when necessary
- CSP violations should be monitored if you implement CSP reporting
- Consider your specific use case when configuring frame options and CSP policies