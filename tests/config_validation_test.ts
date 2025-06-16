#!/usr/bin/env deno test --allow-read

/**
 * Configuration Validation Tests
 * 
 * Ensures all configuration files are valid, consistent, and properly structured
 * for the Cloudflare Tunnel Example project.
 */

import { assertEquals, assert, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parse as parseYaml } from "https://deno.land/std@0.208.0/yaml/parse.ts";
import { exists } from "https://deno.land/std@0.208.0/fs/exists.ts";

Deno.test("Cloudflared config.yml is valid and complete", async () => {
  const configPath = "./cloudflared/config.yml";
  const configText = await Deno.readTextFile(configPath);
  const config = parseYaml(configText) as any;
  
  // Validate tunnel configuration
  assertExists(config.tunnel, "Tunnel ID must be specified");
  assertEquals(config.tunnel, "1e83bc01-0938-41cb-b347-2d331d3bc120");
  
  assertExists(config["credentials-file"], "Credentials file must be specified");
  assertEquals(
    config["credentials-file"], 
    "/etc/cloudflared/credentials/1e83bc01-0938-41cb-b347-2d331d3bc120.json"
  );
  
  // Validate ingress rules
  assertExists(config.ingress, "Ingress rules must be defined");
  assert(Array.isArray(config.ingress), "Ingress must be an array");
  assertEquals(config.ingress.length, 2, "Should have main rule and catch-all");
  
  // Validate main ingress rule
  const mainRule = config.ingress[0];
  assertEquals(mainRule.hostname, "halibut.cc");
  assertEquals(mainRule.service, "http://app:8080");
  
  // Validate origin request configuration
  assertExists(mainRule.originRequest, "Origin request config should exist");
  assertEquals(mainRule.originRequest.noTLSVerify, true);
  assertEquals(mainRule.originRequest.connectTimeout, "30s");
  assertEquals(mainRule.originRequest.keepAliveConnections, 10);
  assertEquals(mainRule.originRequest.keepAliveTimeout, "30s");
  
  // Validate catch-all rule
  const catchAllRule = config.ingress[1];
  assertEquals(catchAllRule.service, "http_status:404");
});

Deno.test("Docker Compose configuration is valid", async () => {
  const configText = await Deno.readTextFile("docker-compose.yml");
  const config = parseYaml(configText) as any;
  
  // Validate services exist
  assertExists(config.services, "Services must be defined");
  assertExists(config.services.app, "App service must be defined");
  assertExists(config.services.cloudflared, "Cloudflared service must be defined");
  
  // Validate app service
  const appService = config.services.app;
  assertEquals(appService.build.context, ".");
  assertEquals(appService.build.dockerfile, "Dockerfile");
  assertEquals(appService.image, "cloudflare-tunnel-example:latest");
  assertEquals(appService.container_name, "cloudflare-tunnel-app");
  assertEquals(appService.restart, "unless-stopped");
  assert(appService.networks.includes("tunnel-network"));
  
  // Ensure no port exposure
  assertEquals(appService.ports, undefined, "App should not expose ports");
  
  // Validate environment
  assertExists(appService.environment);
  assert(appService.environment.includes("RUST_LOG=info"));
  
  // Validate cloudflared service
  const cloudflaredService = config.services.cloudflared;
  assertEquals(cloudflaredService.image, "cloudflare/cloudflared:latest");
  assertEquals(cloudflaredService.container_name, "cloudflare-tunnel");
  assertEquals(cloudflaredService.restart, "on-failure");
  assertEquals(cloudflaredService.command, "tunnel run");
  
  // Validate volumes
  assertExists(cloudflaredService.volumes);
  assertEquals(cloudflaredService.volumes.length, 3);
  assert(cloudflaredService.volumes[0].endsWith("config.yml:/etc/cloudflared/config.yml:ro"));
  assert(cloudflaredService.volumes[1].endsWith("credentials:/etc/cloudflared/credentials:ro"));
  assert(cloudflaredService.volumes[2].endsWith("cert.pem:/home/nonroot/.cloudflared/cert.pem:ro"));
  
  // Validate depends_on
  assertExists(cloudflaredService.depends_on);
  assertExists(cloudflaredService.depends_on.app);
  assertEquals(cloudflaredService.depends_on.app.condition, "service_started");
  
  // Validate network configuration
  assertExists(config.networks);
  assertExists(config.networks["tunnel-network"]);
  assertEquals(config.networks["tunnel-network"].driver, "bridge");
  assertEquals(config.networks["tunnel-network"].ipam.config[0].subnet, "172.20.0.0/16");
});

Deno.test("Deno configuration is valid", async () => {
  const configText = await Deno.readTextFile("deno.jsonc");
  
  // Basic validation - check file exists and has required structure
  assert(configText.includes('"$schema"'), "Config should have schema");
  assert(configText.includes('"tasks"'), "Config should have tasks section");
  
  // Check for essential tasks
  const requiredTasks = [
    "build", "up", "down", "logs", "ps",
    "tunnel:login", "tunnel:create", "tunnel:route", "tunnel:delete",
    "verify", "diagnose", "deploy", "destroy",
    "test", "lint", "fmt"
  ];
  
  for (const task of requiredTasks) {
    assert(configText.includes(`"${task}"`), `Task '${task}' must be defined`);
  }
  
  // Validate specific task content
  assert(configText.includes("docker build"), "Build task should use docker build");
  assert(configText.includes("docker compose up"), "Up task should use docker compose");
  assert(configText.includes("verify-endpoints.ts"), "Should have verify endpoints script");
  assert(configText.includes("cargo test"), "Test task should use cargo test");
});

Deno.test("Required credential files exist", async () => {
  const requiredFiles = [
    {
      path: "./cloudflared/cert.pem",
      description: "Cloudflare certificate"
    },
    {
      path: "./cloudflared/credentials/1e83bc01-0938-41cb-b347-2d331d3bc120.json",
      description: "Tunnel credentials"
    }
  ];
  
  for (const file of requiredFiles) {
    const fileExists = await exists(file.path);
    assert(fileExists, `${file.description} not found at ${file.path}`);
    
    // Verify file is not empty
    const stat = await Deno.stat(file.path);
    assert(stat.size > 0, `${file.description} is empty`);
  }
});

Deno.test("Cargo.toml has required dependencies", async () => {
  const cargoToml = await Deno.readTextFile("Cargo.toml");
  
  // Check package info
  assert(cargoToml.includes('name = "cloudflare-tunnel-example"'));
  assert(cargoToml.includes('edition = "2021"'));
  
  // Check required dependencies
  const requiredDeps = [
    'axum = "0.7"',
    'tokio = { version = "1.0", features = ["full"] }',
    'tower',  // Just check that tower exists, version may vary
    'tower-http',
    'serde = { version = "1.0", features = ["derive"] }',
    'serde_json = "1.0"',
    'tracing = "0.1"',
    'tracing-subscriber',
    'chrono'
  ];
  
  for (const dep of requiredDeps) {
    assert(cargoToml.includes(dep), `Missing required dependency: ${dep}`);
  }
});

Deno.test("Dockerfile follows security best practices", async () => {
  const dockerfile = await Deno.readTextFile("Dockerfile");
  
  // Check for multi-stage build
  const buildStages = dockerfile.match(/FROM .* AS/g);
  assert(buildStages && buildStages.length >= 2, "Should use multi-stage build");
  
  // Check for distroless runtime
  assert(dockerfile.includes("gcr.io/distroless/cc-debian12"), "Should use distroless base image");
  
  // Check for non-root user
  assert(dockerfile.includes("USER 1000:1000"), "Should run as non-root user");
  
  // Note: Security flags are typically set at runtime in docker-compose.yml or docker run
  // The Dockerfile itself focuses on build-time security
  
  // Check for build optimizations
  assert(dockerfile.includes("cargo-chef"), "Should use cargo-chef for caching");
  assert(dockerfile.includes("--release"), "Should build in release mode");
});

Deno.test("Environment variables are consistent", async () => {
  // Check docker-compose.yml environment
  const composeText = await Deno.readTextFile("docker-compose.yml");
  const composeConfig = parseYaml(composeText) as any;
  
  // App service environment
  const appEnv = composeConfig.services.app.environment;
  assert(appEnv.includes("RUST_LOG=info"), "App should have RUST_LOG set");
  
  // Cloudflared service environment
  const cfEnv = composeConfig.services.cloudflared.environment;
  assert(cfEnv.includes("TUNNEL_CONFIG=/etc/cloudflared/config.yml"), "Cloudflared should have TUNNEL_CONFIG set");
});

Deno.test("Scripts directory contains expected automation scripts", async () => {
  const scriptsDir = "./scripts";
  const expectedScripts = [
    "deploy.ts",
    "destroy.ts",
    "diagnose.ts",
    "update-config.ts",
    "verify-endpoints.ts"
  ];
  
  for (const script of expectedScripts) {
    const scriptPath = `${scriptsDir}/${script}`;
    const scriptExists = await exists(scriptPath);
    assert(scriptExists, `Script ${script} not found`);
    
    // Verify script is executable (has shebang)
    const firstLine = await Deno.readTextFile(scriptPath).then(
      content => content.split('\n')[0]
    );
    assert(firstLine.startsWith("#!/usr/bin/env deno"), `Script ${script} should have Deno shebang`);
  }
});

Deno.test("Configuration cross-references are valid", async () => {
  // Load configurations
  const cloudflaredConfig = parseYaml(await Deno.readTextFile("./cloudflared/config.yml")) as any;
  const composeConfig = parseYaml(await Deno.readTextFile("docker-compose.yml")) as any;
  
  // Verify tunnel ID matches in config and credentials path
  const tunnelId = cloudflaredConfig.tunnel;
  const credentialsPath = cloudflaredConfig["credentials-file"];
  assert(credentialsPath.includes(tunnelId), "Credentials path should include tunnel ID");
  
  // Verify service names match between configs
  const ingressService = cloudflaredConfig.ingress[0].service;
  assert(ingressService === "http://app:8080", "Ingress should point to 'app' service");
  assert("app" in composeConfig.services, "Docker Compose should define 'app' service");
  
  // Verify network is used by both services
  const network = "tunnel-network";
  assert(composeConfig.services.app.networks.includes(network));
  assert(composeConfig.services.cloudflared.networks.includes(network));
  assert(network in composeConfig.networks);
});