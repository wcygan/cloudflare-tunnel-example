# Integration Testing Guide

This directory contains integration tests for the Cloudflare Tunnel Example project.

## Test Structure

```
tests/
├── README.md                    # This file
├── config_validation_test.ts    # Configuration file validation
├── docker_integration_test.ts   # Docker Compose service tests
└── fixtures/                    # Test data and mocks (future)
```

## Running Tests

### Quick Start
```bash
# Run all integration tests
deno task test:integration

# Run specific test suites
deno task test:unit         # Rust unit tests
deno task test:config       # Configuration validation
deno task test:docker       # Docker integration tests

# Run with E2E tests (requires deployed tunnel)
deno task test:integration:e2e
```

### Test Types

#### 1. Unit Tests (Rust)
Located in `src/main.rs` using Rust's built-in test framework.

```bash
cargo test
```

Tests:
- API endpoint responses
- Security header middleware
- Error handling
- Response content validation

#### 2. Configuration Validation
Validates all YAML, JSON, and configuration files.

```bash
deno test tests/config_validation_test.ts --allow-read
```

Tests:
- Cloudflared tunnel configuration
- Docker Compose structure
- Deno task definitions
- Required file presence
- Cross-reference validation

#### 3. Docker Integration Tests
Tests container orchestration and networking.

```bash
deno test tests/docker_integration_test.ts --allow-run --allow-net --allow-read
```

Tests:
- Container startup and health
- Internal network connectivity
- Service discovery (app:8080)
- Resource usage limits
- Volume mount verification
- Restart behavior

#### 4. E2E Deployment Tests
End-to-end tests against deployed tunnel (optional).

```bash
deno run --allow-net scripts/verify-endpoints.ts
```

Tests:
- DNS resolution
- HTTPS connectivity
- Cloudflare routing
- Response validation

## Prerequisites

- Docker and Docker Compose
- Rust toolchain (cargo)
- Deno runtime
- Active internet connection for E2E tests

## Writing New Tests

### Deno Test Pattern
```typescript
Deno.test({
  name: "Test name",
  fn: async () => {
    // Setup
    await ensureCleanState();
    
    try {
      // Test logic
      const result = await someOperation();
      assertEquals(result, expected);
    } finally {
      // Cleanup
      await cleanup();
    }
  },
  sanitizeOps: false,     // For async operations
  sanitizeResources: false // For network resources
});
```

### Docker Test Helpers
```typescript
// Wait for container health
await waitForHealthy("container-name", 30_000);

// Get container IP
const ip = await getContainerIp("container-name");

// Check service status
const running = await areServicesRunning();
```

## CI/CD Integration

Tests run automatically on:
- Push to main/develop branches
- Pull requests
- Manual workflow dispatch

See `.github/workflows/integration-tests.yml` for CI configuration.

## Performance Benchmarks

Target metrics:
- Container startup: < 5 seconds
- Memory usage: < 50MB
- API response time: < 10ms (p95)
- Error rate: < 1%

## Troubleshooting

### Common Issues

1. **Docker permission errors**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

2. **Port conflicts**
   ```bash
   docker compose down
   docker ps -a  # Check for orphaned containers
   ```

3. **Test timeouts**
   - Increase timeout values in test files
   - Check Docker daemon status
   - Verify network connectivity

4. **Flaky tests**
   - Use retry logic for network operations
   - Increase delays between operations
   - Check for race conditions

### Debug Mode

Run tests with verbose output:
```bash
RUST_LOG=debug cargo test -- --nocapture
deno test --trace-ops tests/docker_integration_test.ts
```

## Test Data

Mock responses and test fixtures should be placed in `tests/fixtures/`.

Example:
```typescript
// tests/fixtures/mock_responses.ts
export const mockHealthResponse = {
  status: "healthy",
  service: "cloudflare-tunnel-example",
  timestamp: new Date().toISOString()
};
```

## Contributing

When adding new features:
1. Write unit tests in Rust
2. Add integration tests if needed
3. Update configuration validation
4. Ensure all tests pass locally
5. Update this README if needed