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

import { cyan, green, red, yellow } from "https://deno.land/std@0.208.0/fmt/colors.ts";

interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

async function runCommand(cmd: string[], description: string): Promise<CommandResult> {
  console.log(`${cyan("→")} ${description}`);
  
  try {
    const process = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: "piped",
      stderr: "piped",
    });
    
    const result = await process.output();
    const output = new TextDecoder().decode(result.stdout);
    const error = new TextDecoder().decode(result.stderr);
    
    if (result.success) {
      console.log(`  ${green("✓")} Success`);
      return { success: true, output };
    } else {
      console.log(`  ${red("✗")} Failed`);
      if (error) console.log(`  ${red("Error:")} ${error.trim()}`);
      return { success: false, output, error };
    }
  } catch (err) {
    console.log(`  ${red("✗")} Exception: ${err.message}`);
    return { success: false, output: "", error: err.message };
  }
}

async function checkFileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureCredentialsInCorrectLocation(): Promise<string | null> {
  console.log(`${cyan("🔧")} Checking credentials location...`);
  
  // Check if credentials directory exists
  try {
    await Deno.stat("cloudflared/credentials");
  } catch {
    await Deno.mkdir("cloudflared/credentials", { recursive: true });
    console.log(`  ${green("✓")} Created credentials directory`);
  }
  
  let movedTunnelId: string | null = null;
  
  // Look for JSON files in cloudflared/ root and move them to credentials/
  try {
    for await (const entry of Deno.readDir("cloudflared")) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const sourcePath = `cloudflared/${entry.name}`;
        const targetPath = `cloudflared/credentials/${entry.name}`;
        
        // Check if target already exists
        const targetExists = await checkFileExists(targetPath);
        if (!targetExists) {
          await Deno.rename(sourcePath, targetPath);
          console.log(`  ${green("✓")} Moved ${entry.name} to credentials/`);
          movedTunnelId = entry.name.replace(".json", "");
        }
      }
    }
  } catch (err) {
    console.log(`  ${yellow("⚠")} Could not check for credentials files: ${err.message}`);
  }
  
  return movedTunnelId;
}

async function handleTunnelLogin(): Promise<boolean> {
  const certExists = await checkFileExists("cloudflared/cert.pem");
  
  if (certExists) {
    console.log(`${green("✓")} Certificate already exists, skipping login`);
    return true;
  }
  
  console.log(`${cyan("🔐")} Authenticating with Cloudflare...`);
  console.log(`${yellow("📱")} Browser will open for authentication`);
  
  const result = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "login"
  ], "Cloudflare authentication");
  
  return result.success;
}

async function handleTunnelCreation(): Promise<string | null> {
  // First, check if tunnel already exists
  const listResult = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "list"
  ], "Checking existing tunnels");
  
  if (listResult.success) {
    // Check for existing tunnel and get its ID
    const lines = listResult.output.split('\n');
    for (const line of lines) {
      if (line.includes("cloudflare-tunnel-example")) {
        const match = line.match(/^([a-f0-9-]+)\s+cloudflare-tunnel-example/);
        if (match) {
          const tunnelId = match[1];
          console.log(`${green("✓")} Tunnel 'cloudflare-tunnel-example' already exists (${tunnelId})`);
          return tunnelId;
        }
      }
    }
  }
  
  console.log(`${cyan("🚇")} Creating tunnel...`);
  const createResult = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "create", "cloudflare-tunnel-example"
  ], "Creating tunnel");
  
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
  console.log(`${cyan("🔧")} Updating tunnel configuration...`);
  
  const updateResult = await runCommand([
    "deno", "run", "--allow-read", "--allow-write", 
    "scripts/update-config.ts", tunnelId
  ], "Updating config.yml with tunnel ID");
  
  return updateResult.success;
}

async function handleDNSRouting(tunnelId: string): Promise<boolean> {
  console.log(`${cyan("🌐")} Setting up DNS routing...`);
  
  // Route primary domain using tunnel ID
  const result = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "route", "dns", tunnelId, "halibut.cc"
  ], "Configuring DNS for halibut.cc");
  
  // Consider it successful if it worked or already exists
  return result.success || (result.error?.includes("already exists") ?? false);
}

async function buildAndDeploy(): Promise<boolean> {
  console.log(`${cyan("🔨")} Building Docker image...`);
  const buildResult = await runCommand([
    "docker", "build", "-t", "cloudflare-tunnel-example:latest", "."
  ], "Building application image");
  
  if (!buildResult.success) return false;
  
  console.log(`${cyan("🚀")} Starting services...`);
  const upResult = await runCommand([
    "docker", "compose", "up", "-d"
  ], "Starting containers");
  
  return upResult.success;
}

async function waitForServices(): Promise<void> {
  console.log(`${cyan("⏳")} Waiting for services to start...`);
  
  // Wait a bit for containers to initialize
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check container status
  const statusResult = await runCommand([
    "docker", "compose", "ps", "--format", "table"
  ], "Checking container status");
  
  if (statusResult.success) {
    console.log(`${green("✓")} Services started`);
  }
}

async function verifyDeployment(): Promise<boolean> {
  console.log(`${cyan("🔍")} Verifying deployment...`);
  
  // Run the verification script
  const verifyResult = await runCommand([
    "deno", "run", "--allow-net", "scripts/verify-endpoints.ts"
  ], "Testing endpoints");
  
  return verifyResult.success;
}

async function main(): Promise<void> {
  console.log(cyan("🚀 Smart Cloudflare Tunnel Deployment\n"));
  
  try {
    // Step 1: Ensure credentials are in the right place
    const movedTunnelId = await ensureCredentialsInCorrectLocation();
    
    // Step 2: Handle tunnel authentication  
    const loginSuccess = await handleTunnelLogin();
    if (!loginSuccess) {
      console.log(red("\n❌ Tunnel authentication failed"));
      console.log("Please ensure you have a Cloudflare account and the domain is configured.");
      Deno.exit(1);
    }
    
    // Step 3: Handle tunnel creation
    const tunnelId = await handleTunnelCreation();
    if (!tunnelId) {
      console.log(red("\n❌ Tunnel creation failed"));
      Deno.exit(1);
    }
    
    // Step 4: Ensure credentials are moved after creation
    const newMovedId = await ensureCredentialsInCorrectLocation();
    const activeTunnelId = newMovedId || tunnelId;
    
    // Step 5: Update config with correct tunnel ID
    const configSuccess = await updateTunnelConfig(activeTunnelId);
    if (!configSuccess) {
      console.log(yellow("\n⚠️ Failed to update config, but continuing..."));
    }
    
    // Step 6: Set up DNS routing
    const dnsSuccess = await handleDNSRouting(activeTunnelId);
    if (!dnsSuccess) {
      console.log(yellow("\n⚠️ DNS routing failed"));
      console.log("This might be because the DNS record already exists.");
    }
    
    // Step 7: Build and deploy
    const deploySuccess = await buildAndDeploy();
    if (!deploySuccess) {
      console.log(red("\n❌ Build or deployment failed"));
      Deno.exit(1);
    }
    
    // Step 8: Wait for services
    await waitForServices();
    
    // Step 9: Wait for DNS propagation
    console.log(`${cyan("⏳")} Waiting for DNS propagation...`);
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait
    
    // Step 10: Verify deployment
    const verifySuccess = await verifyDeployment();
    
    if (verifySuccess) {
      console.log(green("\n🎉 Deployment successful!"));
      console.log("Your service is now live at:");
      console.log("  • https://halibut.cc/");
      console.log("  • https://halibut.cc/health");
    } else {
      console.log(yellow("\n⚠️ Deployment completed but verification failed"));
      console.log("Services may need a moment to start. Try running:");
      console.log("  deno task verify");
      console.log("\nOr check diagnostics:");
      console.log("  deno task diagnose");
    }
    
  } catch (error) {
    console.error(red(`\n💥 Deployment failed: ${error.message}`));
    console.log("\nFor troubleshooting, see:");
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