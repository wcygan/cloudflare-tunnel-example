#!/usr/bin/env deno run --allow-read --allow-write

/**
 * Cloudflare Tunnel Config Update Script
 * 
 * Updates the tunnel configuration to use the correct tunnel ID
 * and ensures consistency between config and credentials.
 */

import { getCredentialTunnelIds, isValidTunnelId } from "./lib/tunnel.ts";
import { logSection, logStep, logSuccess, logError, logWarning, logInfo } from "./lib/logging.ts";
import type { TunnelConfig } from "./lib/types.ts";

// This function is now imported from lib/tunnel.ts

async function updateConfig(tunnelId: string): Promise<boolean> {
  try {
    // Read current config
    const configPath = "cloudflared/config.yml";
    let config = await Deno.readTextFile(configPath);
    
    // Update tunnel ID
    const oldTunnelMatch = config.match(/tunnel:\s*([a-f0-9-]+)/);
    if (oldTunnelMatch) {
      const oldTunnelId = oldTunnelMatch[1];
      if (oldTunnelId === tunnelId) {
        logSuccess(`Config already uses tunnel ID: ${tunnelId}`);
        return true;
      }
      
      config = config.replace(/tunnel:\s*[a-f0-9-]+/, `tunnel: ${tunnelId}`);
      logInfo(`Updating tunnel ID from ${oldTunnelId} to ${tunnelId}`);
    } else {
      logError("Could not find tunnel ID in config");
      return false;
    }
    
    // Update credentials file path
    const credentialsPath = `/etc/cloudflared/credentials/${tunnelId}.json`;
    const oldCredMatch = config.match(/credentials-file:\s*([^\n]+)/);
    
    if (oldCredMatch) {
      config = config.replace(/credentials-file:\s*[^\n]+/, `credentials-file: ${credentialsPath}`);
    } else {
      // Add credentials-file line after tunnel line
      config = config.replace(
        /tunnel:\s*[a-f0-9-]+/,
        `tunnel: ${tunnelId}\ncredentials-file: ${credentialsPath}`
      );
    }
    
    // Write updated config
    await Deno.writeTextFile(configPath, config);
    logSuccess("Updated config.yml successfully");
    
    // Update .tunnel-config.json
    const tunnelConfig: TunnelConfig = {
      activeTunnelId: tunnelId,
      tunnelName: "cloudflare-tunnel-example",
      domain: "halibut.cc",
      updatedAt: new Date().toISOString(),
    };
    
    await Deno.writeTextFile(".tunnel-config.json", JSON.stringify(tunnelConfig, null, 2));
    logSuccess("Updated .tunnel-config.json");
    
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logError(`Failed to update config: ${errorMessage}`);
    return false;
  }
}

async function main(): Promise<void> {
  logSection("🔧 Cloudflare Tunnel Config Updater");
  
  // Get tunnel ID from args or detect
  let tunnelId = Deno.args[0];
  
  if (!tunnelId) {
    logStep("No tunnel ID provided, detecting from credentials...", "🔍");
    
    const tunnelIds = await getCredentialTunnelIds();
    
    if (tunnelIds.length === 0) {
      logError("No tunnel credentials found");
      logInfo("Run: deno task tunnel:create");
      Deno.exit(1);
    } else if (tunnelIds.length === 1) {
      tunnelId = tunnelIds[0];
      logSuccess(`Found tunnel ID: ${tunnelId}`);
    } else {
      logWarning("Multiple tunnel credentials found:");
      for (const id of tunnelIds) {
        console.log(`  • ${id}`);
      }
      console.log();
      logInfo("Please specify which tunnel to use:");
      console.log("  deno run --allow-read --allow-write scripts/update-config.ts <tunnel-id>");
      Deno.exit(1);
    }
  }
  
  // Validate tunnel ID format
  if (!isValidTunnelId(tunnelId)) {
    logError(`Invalid tunnel ID format: ${tunnelId}`);
    Deno.exit(1);
  }
  
  // Check if credentials exist
  try {
    await Deno.stat(`cloudflared/credentials/${tunnelId}.json`);
    logSuccess(`Credentials found for tunnel ${tunnelId}`);
  } catch {
    logError(`No credentials found for tunnel ${tunnelId}`);
    logInfo("Make sure credentials exist in cloudflared/credentials/");
    Deno.exit(1);
  }
  
  // Update config
  const success = await updateConfig(tunnelId);
  
  if (success) {
    console.log();
    logSuccess("Configuration updated successfully!");
    logStep("Next steps:", "📋");
    console.log("  1. Restart services: deno task restart");
    console.log("  2. Verify deployment: deno task verify");
  } else {
    console.log();
    logError("Failed to update configuration");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}