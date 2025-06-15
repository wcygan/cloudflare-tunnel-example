#!/usr/bin/env deno run --allow-run --allow-read

/**
 * Smart Cloudflare Tunnel Cleanup Script
 * 
 * Handles graceful cleanup with options:
 * - Stop and remove containers
 * - Clean up Docker volumes and build cache  
 * - Optionally remove tunnel and DNS records
 * - Preserve configuration for future deployments
 */

import { cyan, green, red, yellow } from "https://deno.land/std@0.208.0/fmt/colors.ts";

interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

async function runCommand(cmd: string[], description: string, allowFailure = false): Promise<CommandResult> {
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
      if (allowFailure) {
        console.log(`  ${yellow("⚠")} Failed (ignored)`);
      } else {
        console.log(`  ${red("✗")} Failed`);
        if (error) console.log(`  ${red("Error:")} ${error.trim()}`);
      }
      return { success: false, output, error };
    }
  } catch (err) {
    if (allowFailure) {
      console.log(`  ${yellow("⚠")} Exception (ignored): ${err.message}`);
    } else {
      console.log(`  ${red("✗")} Exception: ${err.message}`);
    }
    return { success: false, output: "", error: err.message };
  }
}

async function stopContainers(): Promise<boolean> {
  console.log(`${cyan("🛑")} Stopping containers...`);
  
  const result = await runCommand([
    "docker", "compose", "down"
  ], "Stopping and removing containers");
  
  return result.success;
}

async function cleanupDockerResources(): Promise<boolean> {
  console.log(`${cyan("🧹")} Cleaning up Docker resources...`);
  
  // Clean up volumes
  const volumeResult = await runCommand([
    "docker", "compose", "down", "-v"
  ], "Removing volumes", true);
  
  // Clean cargo cache
  const cargoResult = await runCommand([
    "cargo", "clean"
  ], "Cleaning Rust build cache", true);
  
  return true; // Always return true since these are cleanup operations
}

async function removeDockerImages(): Promise<boolean> {
  console.log(`${cyan("🗑️")} Removing Docker images...`);
  
  // Remove the built image
  await runCommand([
    "docker", "rmi", "cloudflare-tunnel-example:latest"
  ], "Removing application image", true);
  
  // Remove other tagged versions
  await runCommand([
    "docker", "rmi", "cloudflare-tunnel-example:optimized"
  ], "Removing optimized image", true);
  
  await runCommand([
    "docker", "rmi", "cloudflare-tunnel-example:test"
  ], "Removing test image", true);
  
  return true;
}

async function removeTunnelAndDNS(): Promise<boolean> {
  console.log(`${cyan("🚇")} Removing tunnel and DNS records...`);
  
  // Remove DNS record
  await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "route", "delete", "halibut.cc"
  ], "Removing halibut.cc DNS record", true);
  
  // Clean up tunnel connections
  await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "cleanup", "90b6148f-e83f-4749-8649-a1cad20715aa"
  ], "Cleaning up tunnel connections", true);
  
  // Delete the tunnel
  const deleteResult = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "delete", "cloudflare-tunnel-example"
  ], "Deleting tunnel");
  
  return deleteResult.success;
}

async function removeCredentials(): Promise<boolean> {
  console.log(`${cyan("🔐")} Removing tunnel credentials...`);
  
  try {
    // Remove credentials files
    for await (const entry of Deno.readDir("cloudflared/credentials")) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        await Deno.remove(`cloudflared/credentials/${entry.name}`);
        console.log(`  ${green("✓")} Removed ${entry.name}`);
      }
    }
    
    // Remove certificate
    try {
      await Deno.remove("cloudflared/cert.pem");
      console.log(`  ${green("✓")} Removed cert.pem`);
    } catch {
      console.log(`  ${yellow("⚠")} cert.pem not found`);
    }
    
    return true;
  } catch (err) {
    console.log(`  ${red("✗")} Failed to remove credentials: ${err.message}`);
    return false;
  }
}

async function parseArgs(): Promise<{ full: boolean, keepTunnel: boolean, keepImages: boolean }> {
  const args = Deno.args;
  
  return {
    full: args.includes("--full") || args.includes("-f"),
    keepTunnel: args.includes("--keep-tunnel") || args.includes("-t"),
    keepImages: args.includes("--keep-images") || args.includes("-i"),
  };
}

async function showUsage(): Promise<void> {
  console.log(cyan("Smart Cloudflare Tunnel Cleanup\n"));
  console.log("Usage: deno task destroy [options]\n");
  console.log("Options:");
  console.log("  --full, -f         Complete removal (tunnel + DNS + credentials)");
  console.log("  --keep-tunnel, -t  Keep tunnel and credentials (default)");
  console.log("  --keep-images, -i  Keep Docker images");
  console.log("");
  console.log("Examples:");
  console.log("  deno task destroy              # Stop containers, keep tunnel config");
  console.log("  deno task destroy --full       # Remove everything including tunnel");
  console.log("  deno task destroy --keep-images # Stop containers, keep images");
}

async function main(): Promise<void> {
  const { full, keepTunnel, keepImages } = await parseArgs();
  
  if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
    await showUsage();
    return;
  }
  
  console.log(cyan("🧹 Smart Cloudflare Tunnel Cleanup\n"));
  
  try {
    // Always stop containers
    const stopSuccess = await stopContainers();
    if (!stopSuccess) {
      console.log(yellow("⚠️ Failed to stop containers, but continuing..."));
    }
    
    // Always clean up Docker resources
    await cleanupDockerResources();
    
    // Remove images unless specifically keeping them
    if (!keepImages) {
      await removeDockerImages();
    } else {
      console.log(`${yellow("⚠")} Keeping Docker images as requested`);
    }
    
    // Handle tunnel cleanup based on options
    if (full && !keepTunnel) {
      console.log(yellow("\n🚨 Full cleanup requested - removing tunnel and credentials"));
      
      const tunnelRemoved = await removeTunnelAndDNS();
      if (tunnelRemoved) {
        await removeCredentials();
        console.log(green("\n✅ Complete cleanup successful!"));
        console.log("All resources removed. You'll need to run tunnel setup again for redeployment.");
      } else {
        console.log(red("\n❌ Failed to remove tunnel"));
      }
    } else {
      console.log(green("\n✅ Cleanup successful!"));
      console.log("Services stopped and cleaned up.");
      console.log("Tunnel configuration preserved for future deployment.");
      console.log("\nTo remove tunnel completely, run:");
      console.log("  deno task destroy --full");
    }
    
    // Show what's left
    console.log(cyan("\n📋 Status:"));
    console.log(`  • Containers: ${green("stopped")}`);
    console.log(`  • Volumes: ${green("removed")}`);
    console.log(`  • Images: ${keepImages ? yellow("preserved") : green("removed")}`);
    console.log(`  • Tunnel: ${(full && !keepTunnel) ? green("removed") : yellow("preserved")}`);
    console.log(`  • Configuration: ${(full && !keepTunnel) ? green("removed") : yellow("preserved")}`);
    
  } catch (error) {
    console.error(red(`\n💥 Cleanup failed: ${error.message}`));
    Deno.exit(1);
  }
}

// Run if this is the main module
if (import.meta.main) {
  await main();
}