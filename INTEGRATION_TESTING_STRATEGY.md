# Integration Testing Strategy for Cloudflare Tunnel Example

## Overview

This document outlines a comprehensive integration testing strategy for the Cloudflare Tunnel Example project, a Rust Axum web service exposed through Cloudflare Tunnel using Docker Compose. The strategy covers multiple testing layers from unit tests to end-to-end deployment verification.

## Architecture Context

```
Client → Cloudflare Edge → Tunnel (QUIC/WSS) → Docker Container (Axum:8080)
```

### Key Components
- **Rust Axum Service**: HTTP API with `/` and `/health` endpoints
- **Docker Compose**: Multi-container orchestration (app + cloudflared)
- **Cloudflare Tunnel**: Zero-trust connectivity without inbound ports
- **Deno Automation**: Task runners and verification scripts

## Testing Layers

### 1. API Integration Tests (Rust/Axum)

#### Purpose
Verify the Axum service behavior, middleware, and endpoint responses in isolation.

#### Implementation Strategy
```rust
// tests/api_integration.rs
#[cfg(test)]
mod tests {
    use axum_test::TestServer;
    use cloudflare_tunnel_example::create_app;
    
    #[tokio::test]
    async fn test_root_endpoint() {
        let server = TestServer::new(create_app()).unwrap();
        let response = server.get("/").await;
        
        assert_eq!(response.status(), 200);
        assert!(response.text().contains("Hello World"));
        assert_eq!(response.header("x-frame-options"), "DENY");
    }
    
    #[tokio::test]
    async fn test_health_endpoint() {
        let server = TestServer::new(create_app()).unwrap();
        let response = server.get("/health").await;
        
        assert_eq!(response.status(), 200);
        let json: serde_json::Value = response.json();
        assert_eq!(json["status"], "healthy");
        assert!(json["timestamp"].is_string());
    }
    
    #[tokio::test]
    async fn test_security_headers() {
        let server = TestServer::new(create_app()).unwrap();
        let response = server.get("/").await;
        
        // Verify all security headers
        assert_eq!(response.header("x-content-type-options"), "nosniff");
        assert_eq!(response.header("x-frame-options"), "DENY");
        assert!(response.header("strict-transport-security").contains("max-age=31536000"));
        assert!(response.header("content-security-policy").contains("default-src 'self'"));
    }
}
```

#### Test Coverage Goals
- All endpoints return correct status codes
- Response content matches expectations
- Security headers are properly set
- Error handling for malformed requests
- Performance benchmarks (< 10ms response time)

### 2. Docker Compose Service Integration Tests

#### Purpose
Verify container orchestration, networking, and service discovery.

#### Implementation Strategy
```typescript
// tests/docker_integration_test.ts
import { assertEquals } from "@std/assert";
import { $ } from "@david/dax";

Deno.test("Docker Compose services start correctly", async () => {
  // Start services
  await $`docker compose up -d`.quiet();
  
  try {
    // Wait for services to be healthy
    await waitForHealthy("cloudflare-tunnel-app", 30);
    
    // Verify internal networking
    const appIp = await getContainerIp("cloudflare-tunnel-app");
    const response = await fetch(`http://${appIp}:8080/health`);
    
    assertEquals(response.status, 200);
    const json = await response.json();
    assertEquals(json.status, "healthy");
    
  } finally {
    await $`docker compose down`.quiet();
  }
});

Deno.test("Container resource limits are enforced", async () => {
  await $`docker compose up -d`.quiet();
  
  try {
    const stats = await $`docker stats --no-stream --format json cloudflare-tunnel-app`.json();
    const memUsage = parseFloat(stats.MemUsage.split("MiB")[0]);
    
    // Verify memory usage is under 50MB
    assert(memUsage < 50, `Memory usage ${memUsage}MB exceeds 50MB limit`);
    
  } finally {
    await $`docker compose down`.quiet();
  }
});
```

#### Test Coverage Goals
- Container startup sequence validation
- Internal network connectivity (172.20.0.0/16)
- Service discovery (app:8080)
- Resource usage constraints
- Container restart behavior
- Volume mount verification

### 3. Cloudflare Tunnel Connectivity Tests

#### Purpose
Verify tunnel establishment, routing, and DNS resolution.

#### Implementation Strategy
```typescript
// tests/tunnel_connectivity_test.ts
import { assertEquals, assertExists } from "@std/assert";

Deno.test("Tunnel connects to Cloudflare edge", async () => {
  // Start services
  await deployServices();
  
  try {
    // Wait for tunnel to establish
    await waitForTunnelReady(60);
    
    // Verify tunnel status via cloudflared API
    const tunnelInfo = await getTunnelInfo();
    assertEquals(tunnelInfo.status, "connected");
    assertExists(tunnelInfo.connectorId);
    
    // Verify DNS resolution
    const dnsResult = await Deno.resolveDns("halibut.cc", "A");
    assert(dnsResult.length > 0, "DNS should resolve to Cloudflare IPs");
    
  } finally {
    await teardownServices();
  }
});

Deno.test("Tunnel handles connection failures gracefully", async () => {
  await deployServices();
  
  try {
    // Simulate app container failure
    await $`docker stop cloudflare-tunnel-app`.quiet();
    
    // Verify tunnel returns 502/503
    const response = await fetch("https://halibut.cc/", { 
      signal: AbortSignal.timeout(5000) 
    });
    
    assert([502, 503].includes(response.status), 
      `Expected 502/503, got ${response.status}`);
    
    // Restart app and verify recovery
    await $`docker start cloudflare-tunnel-app`.quiet();
    await waitForHealthy("cloudflare-tunnel-app", 30);
    
    const recoveryResponse = await fetch("https://halibut.cc/health");
    assertEquals(recoveryResponse.status, 200);
    
  } finally {
    await teardownServices();
  }
});
```

#### Test Coverage Goals
- Tunnel authentication and establishment
- DNS routing verification
- Connection retry logic
- Failover behavior
- Certificate validation
- Origin request headers

### 4. End-to-End Deployment Tests

#### Purpose
Full deployment lifecycle testing including setup, operation, and teardown.

#### Implementation Strategy
```typescript
// tests/e2e_deployment_test.ts
import { assertEquals } from "@std/assert";
import { delay } from "@std/async";

Deno.test("Complete deployment lifecycle", async () => {
  const deploymentId = crypto.randomUUID();
  
  try {
    // Phase 1: Build and deploy
    console.log("Building Docker image...");
    await $`deno task build`.quiet();
    
    console.log("Starting services...");
    await $`deno task deploy:full`.quiet();
    
    // Phase 2: Verify endpoints
    console.log("Verifying endpoints...");
    const endpoints = [
      { url: "https://halibut.cc/", expectedContent: "Hello World" },
      { url: "https://halibut.cc/health", expectedContent: "healthy" }
    ];
    
    for (const endpoint of endpoints) {
      const response = await fetchWithRetry(endpoint.url, 5, 2000);
      assertEquals(response.status, 200);
      
      const text = await response.text();
      assert(text.includes(endpoint.expectedContent));
      
      // Verify Cloudflare headers
      assertEquals(response.headers.get("cf-ray"), true);
      assertEquals(response.headers.get("server"), "cloudflare");
    }
    
    // Phase 3: Performance testing
    console.log("Running performance tests...");
    const latencies = await measureLatencies("https://halibut.cc/health", 100);
    const p95 = percentile(latencies, 0.95);
    
    assert(p95 < 100, `P95 latency ${p95}ms exceeds 100ms threshold`);
    
    // Phase 4: Stress testing
    console.log("Running stress test...");
    const stressResults = await runStressTest({
      url: "https://halibut.cc/health",
      duration: 10,
      concurrency: 50
    });
    
    assert(stressResults.errorRate < 0.01, 
      `Error rate ${stressResults.errorRate} exceeds 1% threshold`);
    
  } finally {
    // Cleanup
    await $`deno task destroy:full`.quiet();
  }
});
```

#### Test Coverage Goals
- Full deployment automation
- Multi-region endpoint verification
- Performance benchmarks (latency, throughput)
- Stress testing under load
- Graceful shutdown verification
- Rollback scenarios

### 5. Configuration Validation Tests

#### Purpose
Ensure all configuration files are valid and consistent.

#### Implementation Strategy
```typescript
// tests/config_validation_test.ts
import { parse as parseYaml } from "@std/yaml";
import { assertEquals, assertExists } from "@std/assert";

Deno.test("Cloudflared config is valid", async () => {
  const configPath = "./cloudflared/config.yml";
  const config = parseYaml(await Deno.readTextFile(configPath));
  
  // Validate tunnel configuration
  assertExists(config.tunnel);
  assertEquals(config.tunnel, "1e83bc01-0938-41cb-b347-2d331d3bc120");
  
  // Validate ingress rules
  assertExists(config.ingress);
  assertEquals(config.ingress.length, 2);
  
  const mainRule = config.ingress[0];
  assertEquals(mainRule.hostname, "halibut.cc");
  assertEquals(mainRule.service, "http://app:8080");
  
  // Validate origin request settings
  assertExists(mainRule.originRequest);
  assertEquals(mainRule.originRequest.noTLSVerify, true);
  assertEquals(mainRule.originRequest.connectTimeout, "30s");
});

Deno.test("Docker Compose config is valid", async () => {
  const config = parseYaml(await Deno.readTextFile("docker-compose.yml"));
  
  // Validate service definitions
  assertExists(config.services.app);
  assertExists(config.services.cloudflared);
  
  // Validate networking
  assertEquals(config.networks["tunnel-network"].ipam.config[0].subnet, 
    "172.20.0.0/16");
  
  // Validate volume mounts
  const cloudflaredVolumes = config.services.cloudflared.volumes;
  assertEquals(cloudflaredVolumes.length, 3);
  assert(cloudflaredVolumes.every(v => v.endsWith(":ro")), 
    "All volumes should be read-only");
});

Deno.test("Environment consistency", async () => {
  // Verify all required files exist
  const requiredFiles = [
    "./cloudflared/cert.pem",
    "./cloudflared/credentials/1e83bc01-0938-41cb-b347-2d331d3bc120.json",
    "./Dockerfile",
    "./deno.jsonc"
  ];
  
  for (const file of requiredFiles) {
    const exists = await Deno.stat(file).then(() => true).catch(() => false);
    assert(exists, `Required file ${file} not found`);
  }
});
```

#### Test Coverage Goals
- YAML syntax validation
- Configuration consistency
- Secret file presence
- Environment variable validation
- Cross-reference validation

## Test Execution Strategy

### Local Development Testing
```bash
# Unit tests (fast, run frequently)
cargo test

# Integration tests (containerized)
deno test tests/docker_integration_test.ts

# E2E tests (requires Cloudflare account)
deno test tests/e2e_deployment_test.ts --allow-all
```

### CI/CD Pipeline Testing
```yaml
# .github/workflows/test.yml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run unit tests
        run: cargo test
        
      - name: Run Docker integration tests
        run: |
          deno test tests/docker_integration_test.ts \
            --allow-run --allow-net --allow-read
            
      - name: Run config validation
        run: |
          deno test tests/config_validation_test.ts \
            --allow-read
```

### Production Deployment Testing
```typescript
// scripts/production_test.ts
async function runProductionTests() {
  const tests = [
    { name: "DNS Resolution", fn: testDnsResolution },
    { name: "SSL Certificate", fn: testSslCertificate },
    { name: "Response Times", fn: testResponseTimes },
    { name: "Security Headers", fn: testSecurityHeaders },
    { name: "Rate Limiting", fn: testRateLimiting }
  ];
  
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✓ ${test.name} passed`);
    } catch (error) {
      console.error(`✗ ${test.name} failed: ${error.message}`);
      Deno.exit(1);
    }
  }
}
```

## Test Data Management

### Mock Data
```typescript
// tests/fixtures/mock_responses.ts
export const mockHealthResponse = {
  status: "healthy",
  service: "cloudflare-tunnel-example",
  timestamp: new Date().toISOString()
};

export const mockTunnelInfo = {
  id: "1e83bc01-0938-41cb-b347-2d331d3bc120",
  name: "cloudflare-tunnel-example",
  status: "connected",
  connectorId: "mock-connector-id"
};
```

### Test Environment Configuration
```typescript
// tests/test_env.ts
export const TEST_CONFIG = {
  // Use separate tunnel for testing
  tunnelId: Deno.env.get("TEST_TUNNEL_ID") || "test-tunnel-id",
  domain: Deno.env.get("TEST_DOMAIN") || "test.halibut.cc",
  
  // Timeouts
  containerStartTimeout: 30_000,
  tunnelConnectTimeout: 60_000,
  endpointTimeout: 10_000,
  
  // Performance thresholds
  maxLatencyP95: 100, // ms
  maxErrorRate: 0.01, // 1%
  minThroughput: 1000 // req/s
};
```

## Monitoring and Observability

### Test Metrics Collection
```typescript
// tests/utils/metrics.ts
export class TestMetrics {
  private metrics: Map<string, any[]> = new Map();
  
  record(metric: string, value: any) {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    this.metrics.get(metric)!.push(value);
  }
  
  summary() {
    const summary: Record<string, any> = {};
    
    for (const [key, values] of this.metrics) {
      if (typeof values[0] === "number") {
        summary[key] = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b) / values.length,
          p95: percentile(values, 0.95),
          p99: percentile(values, 0.99)
        };
      } else {
        summary[key] = values;
      }
    }
    
    return summary;
  }
}
```

### Test Result Reporting
```typescript
// tests/utils/reporter.ts
export async function generateTestReport(results: TestResults) {
  const report = {
    timestamp: new Date().toISOString(),
    environment: Deno.env.get("TEST_ENV") || "local",
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      duration: results.duration
    },
    tests: results.tests,
    metrics: results.metrics
  };
  
  // Write HTML report
  await Deno.writeTextFile(
    `test-results/report-${Date.now()}.html`,
    generateHtmlReport(report)
  );
  
  // Write JSON for CI processing
  await Deno.writeTextFile(
    `test-results/report-${Date.now()}.json`,
    JSON.stringify(report, null, 2)
  );
}
```

## Common Test Patterns

### Retry Logic for Flaky Networks
```typescript
async function fetchWithRetry(
  url: string, 
  maxRetries: number = 3, 
  delay: number = 1000
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000)
      });
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}
```

### Container Health Checks
```typescript
async function waitForHealthy(
  containerName: string, 
  timeoutSeconds: number
): Promise<void> {
  const deadline = Date.now() + (timeoutSeconds * 1000);
  
  while (Date.now() < deadline) {
    const result = await $`docker inspect ${containerName}`.json();
    const health = result[0]?.State?.Health?.Status;
    
    if (health === "healthy") return;
    
    await delay(1000);
  }
  
  throw new Error(`Container ${containerName} not healthy after ${timeoutSeconds}s`);
}
```

### Performance Measurement
```typescript
async function measureLatencies(
  url: string, 
  count: number
): Promise<number[]> {
  const latencies: number[] = [];
  
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    try {
      await fetch(url);
      latencies.push(performance.now() - start);
    } catch {
      // Record timeout as max latency
      latencies.push(10000);
    }
  }
  
  return latencies;
}
```

## Security Testing Considerations

### Authentication Tests
- Verify tunnel credentials are properly protected
- Test invalid credential scenarios
- Validate certificate pinning

### Authorization Tests
- Ensure only configured hostnames are routed
- Test path-based access controls
- Verify origin IP restrictions

### Input Validation
- Test malformed requests
- Verify header size limits
- Test request body limits

## Next Steps

1. **Implement Core Test Suite**
   - Start with API integration tests in Rust
   - Add Docker Compose integration tests
   - Implement configuration validation

2. **Set Up CI Pipeline**
   - GitHub Actions workflow for automated testing
   - Docker build caching for faster CI runs
   - Test result artifacts and reporting

3. **Production Monitoring**
   - Implement synthetic monitoring for production endpoints
   - Set up alerting for test failures
   - Create dashboard for test metrics

4. **Performance Baseline**
   - Establish performance benchmarks
   - Create load testing scenarios
   - Document acceptable thresholds

This comprehensive testing strategy ensures reliability, security, and performance of the Cloudflare Tunnel deployment while maintaining fast development cycles through appropriate test layering.