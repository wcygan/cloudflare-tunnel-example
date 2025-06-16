#!/usr/bin/env deno run --allow-net --allow-run --allow-read --allow-write

/**
 * Smart Cloudflare Tunnel Deployment Script
 * 
 * Handles the complete deployment pipeline with intelligent error handling:
 * - Skips tunnel login if certificate exists
 * - Skips tunnel creation if tunnel already exists
 * - Ensures DNS routing for both domains
 * - Builds and deploys containers
 * - Verifies endpoints are working
 */

import { runCommand } from "./lib/command.ts";
import { checkFileExists, ensureDir } from "./lib/fs.ts";
import { 
  ensureCredentialsInCorrectLocation, 
  getTunnelList, 
  isValidTunnelId 
} from "./lib/tunnel.ts";
import { 
  logSection, 
  logStep, 
  logSuccess, 
  logError, 
  logWarning,
  logInfo 
} from "./lib/logging.ts";
import type { CommandResult, TunnelInfo } from "./lib/types.ts";

// Functions now imported from lib utilities

// Function now imported from lib/tunnel.ts

async function handleTunnelLogin(): Promise<boolean> {
  const certExists = await checkFileExists("cloudflared/cert.pem");
  
  if (certExists) {
    logSuccess("Certificate already exists, skipping login");
    return true;
  }
  
  logStep("Authenticating with Cloudflare...", "🔐");
  logInfo("Browser will open for authentication");
  
  const result = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "login"
  ], { description: "Cloudflare authentication" });
  
  return result.success;
}

async function handleTunnelCreation(): Promise<string | null> {
  // First, check if tunnel already exists
  const tunnels = await getTunnelList();
  const existingTunnel = tunnels.find(t => t.name === "cloudflare-tunnel-example");
  
  if (existingTunnel) {
    logSuccess(`Tunnel 'cloudflare-tunnel-example' already exists (${existingTunnel.id})`);
    return existingTunnel.id;
  }
  
  logStep("Creating tunnel...", "🚇");
  const createResult = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "create", "cloudflare-tunnel-example"
  ], { description: "Creating tunnel" });
  
  if (createResult.success) {
    // Extract tunnel ID from output
    const match = createResult.output.match(/Created tunnel ([a-f0-9-]+)/);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

async function updateTunnelConfig(tunnelId: string): Promise<boolean> {
  logStep("Updating tunnel configuration...", "🔧");
  
  const updateResult = await runCommand([
    "deno", "run", "--allow-read", "--allow-write", 
    "scripts/update-config.ts", tunnelId
  ], { description: "Updating config.yml with tunnel ID" });
  
  return updateResult.success;
}

async function handleDNSRouting(tunnelId: string): Promise<boolean> {
  logStep("Setting up DNS routing...", "🌐");
  
  // Route primary domain using tunnel ID
  const result = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "route", "dns", tunnelId, "halibut.cc"
  ], { description: "Configuring DNS for halibut.cc" });
  
  // Consider it successful if it worked or already exists
  return result.success || (result.error?.includes("already exists") ?? false);
}

async function buildAndDeploy(): Promise<boolean> {
  logStep("Building Docker image...", "🔨");
  const buildResult = await runCommand([
    "docker", "build", "-t", "cloudflare-tunnel-example:latest", "."
  ], { description: "Building application image" });
  
  if (!buildResult.success) return false;
  
  logStep("Starting services...", "🚀");
  const upResult = await runCommand([
    "docker", "compose", "up", "-d"
  ], { description: "Starting containers" });
  
  return upResult.success;
}

async function waitForServices(): Promise<void> {
  logStep("Waiting for services to start...", "⏳");
  
  // Wait a bit for containers to initialize
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check container status
  const statusResult = await runCommand([
    "docker", "compose", "ps", "--format", "table"
  ], { description: "Checking container status" });
  
  if (statusResult.success) {
    logSuccess("Services started");
  }
}

async function verifyDeployment(): Promise<boolean> {
  logStep("Verifying deployment...", "🔍");
  
  // Run the verification script
  const verifyResult = await runCommand([
    "deno", "run", "--allow-net", "scripts/verify-endpoints.ts"
  ], { description: "Testing endpoints" });
  
  return verifyResult.success;
}

async function main(): Promise<void> {
  logSection("🚀 Smart Cloudflare Tunnel Deployment");
  
  try {
    // Step 1: Ensure credentials are in the right place
    const movedTunnelId = await ensureCredentialsInCorrectLocation();
    
    // Step 2: Handle tunnel authentication  
    const loginSuccess = await handleTunnelLogin();
    if (!loginSuccess) {
      console.log();
      logError("Tunnel authentication failed");
      logInfo("Please ensure you have a Cloudflare account and the domain is configured.");
      Deno.exit(1);
    }
    
    // Step 3: Handle tunnel creation
    const tunnelId = await handleTunnelCreation();
    if (!tunnelId) {
      console.log();
      logError("Tunnel creation failed");
      Deno.exit(1);
    }
    
    // Step 4: Ensure credentials are moved after creation
    const newMovedId = await ensureCredentialsInCorrectLocation();
    const activeTunnelId = newMovedId || tunnelId;
    
    // Step 5: Update config with correct tunnel ID
    const configSuccess = await updateTunnelConfig(activeTunnelId);
    if (!configSuccess) {
      console.log();
      logWarning("Failed to update config, but continuing...");
    }
    
    // Step 6: Set up DNS routing
    const dnsSuccess = await handleDNSRouting(activeTunnelId);
    if (!dnsSuccess) {
      console.log();
      logWarning("DNS routing failed");
      logInfo("This might be because the DNS record already exists.");
    }
    
    // Step 7: Build and deploy
    const deploySuccess = await buildAndDeploy();
    if (!deploySuccess) {
      console.log();
      logError("Build or deployment failed");
      Deno.exit(1);
    }
    
    // Step 8: Wait for services
    await waitForServices();
    
    // Step 9: Wait for DNS propagation
    logStep("Waiting for DNS propagation...", "⏳");
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait
    
    // Step 10: Verify deployment
    const verifySuccess = await verifyDeployment();
    
    if (verifySuccess) {
      console.log();
      logSuccess("Deployment successful!");
      console.log("Your service is now live at:");
      console.log("  • https://halibut.cc/");
      console.log("  • https://halibut.cc/health");
    } else {
      console.log();
      logWarning("Deployment completed but verification failed");
      logInfo("Services may need a moment to start. Try running:");
      console.log("  deno task verify");
      console.log();
      logInfo("Or check diagnostics:");
      console.log("  deno task diagnose");
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log();
    logError(`Deployment failed: ${errorMessage}`);
    console.log();
    logInfo("For troubleshooting, see:");
    console.log("  • TROUBLESHOOTING.md");
    console.log("  • deno task logs");
    console.log("  • deno task diagnose");
    Deno.exit(1);
  }
}

// Run if this is the main module
if (import.meta.main) {
  await main();
}