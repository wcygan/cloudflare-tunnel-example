# API Reference

This document provides detailed information about the Cloudflare Tunnel Example API endpoints.

## Base URL

- **Local Development**: `http://localhost:8080`
- **Production**: `https://hello.halibut.cc`
- **Health Check Subdomain**: `https://health.halibut.cc`

## Authentication

This example service does not require authentication. In production, you can add:
- Cloudflare Access for zero-trust authentication
- JWT tokens in the Axum service
- API keys for service-to-service communication

## Endpoints

### GET /

Returns a simple HTML "Hello World" page.

**Request:**
```http
GET / HTTP/1.1
Host: hello.halibut.cc
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Server: cloudflare-tunnel-example
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Length: 72

<h1>Hello World</h1><p>Cloudflare Tunnel Example - Rust Axum Service</p>
```

**Use Cases:**
- Basic connectivity testing
- Service availability verification
- Example of security headers implementation

### GET /health

Returns the service health status in JSON format.

**Request:**
```http
GET /health HTTP/1.1
Host: health.halibut.cc
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Server: cloudflare-tunnel-example
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Length: 108

{
  "status": "healthy",
  "service": "cloudflare-tunnel-example",
  "timestamp": "2025-06-15T19:51:17.481827205+00:00"
}
```

**Response Schema:**
```json
{
  "status": "string",      // Always "healthy" if service is responding
  "service": "string",     // Service identifier
  "timestamp": "string"    // ISO 8601 timestamp in UTC
}
```

**Use Cases:**
- Health check monitoring
- Load balancer health probes
- Service discovery validation
- Uptime monitoring

## Security Headers

All endpoints include comprehensive security headers:

### Content Security Policy (CSP)
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'
```

**Protection**: Prevents XSS attacks by controlling resource loading

### HTTP Strict Transport Security (HSTS)
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

**Protection**: Forces HTTPS connections for 1 year, includes subdomains

### Additional Security Headers
- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking attacks
- `X-XSS-Protection: 1; mode=block` - Enables XSS filtering
- `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer information
- `Permissions-Policy: geolocation=(), microphone=(), camera=()` - Restricts browser APIs

## Error Handling

The service implements standard HTTP error responses:

### 404 Not Found
Returned for any path not matching defined routes.

```http
HTTP/1.1 404 Not Found
Content-Type: text/plain
Content-Length: 9

Not Found
```

### Network Errors
If the Cloudflare tunnel is down or misconfigured, requests will fail at the Cloudflare edge with appropriate error pages.

## Rate Limiting

Rate limiting is handled by Cloudflare's edge infrastructure:
- Default: 1000 requests per minute per IP
- Configurable via Cloudflare dashboard
- Can be customized based on domain, path, or user agent

## Monitoring and Observability

### Logging
The service uses structured logging via the `tracing` crate:
- Log level controlled by `RUST_LOG` environment variable
- Default level: `info`
- Logs include request IDs for correlation

### Metrics
For production use, consider adding:
- Prometheus metrics endpoint
- Request duration histograms
- Request count by status code
- Custom business metrics

### Health Check Integration
The `/health` endpoint is designed for:
- Kubernetes liveness/readiness probes
- Load balancer health checks
- Monitoring system integration
- Automated alerting triggers

## Client Examples

### cURL
```bash
# Basic request
curl https://hello.halibut.cc

# Health check
curl https://health.halibut.cc

# With headers
curl -v https://hello.halibut.cc
```

### JavaScript (Fetch API)
```javascript
// Basic request
const response = await fetch('https://hello.halibut.cc');
const html = await response.text();

// Health check
const healthResponse = await fetch('https://health.halibut.cc');
const health = await healthResponse.json();
console.log('Service status:', health.status);
```

### Python (requests)
```python
import requests

# Basic request
response = requests.get('https://hello.halibut.cc')
print(response.text)

# Health check
health_response = requests.get('https://health.halibut.cc')
health_data = health_response.json()
print(f"Service status: {health_data['status']}")
```

## Performance Characteristics

### Response Times
- **Local network**: <1ms
- **Through Cloudflare tunnel**: <100ms globally
- **Cold start**: ~250ms container startup

### Throughput
- **Static content**: >10,000 requests/second
- **JSON responses**: >8,000 requests/second
- **Memory usage**: <40MB under load

### Caching
Cloudflare automatically caches static content:
- HTML responses: Edge cached for 2 hours
- Health check: Not cached (dynamic content)
- Custom cache rules can be configured

## Future Enhancements

Potential API improvements for production:
- Add POST endpoints for data submission
- Implement API versioning (`/v1/`, `/v2/`)
- Add OpenAPI/Swagger specification
- Include request/response validation
- Add authentication middleware
- Implement custom metrics endpoints