#!/usr/bin/env deno run --allow-read --allow-write

/**
 * Cloudflare Tunnel Config Update Script
 * 
 * Updates the tunnel configuration to use the correct tunnel ID
 * and ensures consistency between config and credentials.
 */

import { cyan, green, red, yellow } from "https://deno.land/std@0.208.0/fmt/colors.ts";

async function getCredentialTunnelIds(): Promise<string[]> {
  const tunnelIds: string[] = [];
  
  try {
    for await (const entry of Deno.readDir("cloudflared/credentials")) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        tunnelIds.push(entry.name.replace(".json", ""));
      }
    }
  } catch (err) {
    console.log(`${red("✗")} Failed to read credentials directory: ${err.message}`);
  }
  
  return tunnelIds;
}

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
        console.log(`${green("✓")} Config already uses tunnel ID: ${tunnelId}`);
        return true;
      }
      
      config = config.replace(/tunnel:\s*[a-f0-9-]+/, `tunnel: ${tunnelId}`);
      console.log(`${yellow("→")} Updating tunnel ID from ${oldTunnelId} to ${tunnelId}`);
    } else {
      console.log(`${red("✗")} Could not find tunnel ID in config`);
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
    console.log(`${green("✓")} Updated config.yml successfully`);
    
    // Update .tunnel-config.json
    const tunnelConfig = {
      activeTunnelId: tunnelId,
      tunnelName: "cloudflare-tunnel-example",
      domain: "halibut.cc",
      updatedAt: new Date().toISOString(),
    };
    
    await Deno.writeTextFile(".tunnel-config.json", JSON.stringify(tunnelConfig, null, 2));
    console.log(`${green("✓")} Updated .tunnel-config.json`);
    
    return true;
  } catch (err) {
    console.log(`${red("✗")} Failed to update config: ${err.message}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log(cyan("🔧 Cloudflare Tunnel Config Updater\n"));
  
  // Get tunnel ID from args or detect
  let tunnelId = Deno.args[0];
  
  if (!tunnelId) {
    console.log(`${cyan("🔍")} No tunnel ID provided, detecting from credentials...`);
    
    const tunnelIds = await getCredentialTunnelIds();
    
    if (tunnelIds.length === 0) {
      console.log(`${red("✗")} No tunnel credentials found`);
      console.log(`${yellow("💡")} Run: deno task tunnel:create`);
      Deno.exit(1);
    } else if (tunnelIds.length === 1) {
      tunnelId = tunnelIds[0];
      console.log(`${green("✓")} Found tunnel ID: ${tunnelId}`);
    } else {
      console.log(`${yellow("⚠")} Multiple tunnel credentials found:`);
      for (const id of tunnelIds) {
        console.log(`  • ${id}`);
      }
      console.log(`\n${yellow("💡")} Please specify which tunnel to use:`);
      console.log(`  deno run --allow-read --allow-write scripts/update-config.ts <tunnel-id>`);
      Deno.exit(1);
    }
  }
  
  // Validate tunnel ID format
  if (!tunnelId.match(/^[a-f0-9-]{36}$/)) {
    console.log(`${red("✗")} Invalid tunnel ID format: ${tunnelId}`);
    Deno.exit(1);
  }
  
  // Check if credentials exist
  try {
    await Deno.stat(`cloudflared/credentials/${tunnelId}.json`);
    console.log(`${green("✓")} Credentials found for tunnel ${tunnelId}`);
  } catch {
    console.log(`${red("✗")} No credentials found for tunnel ${tunnelId}`);
    console.log(`${yellow("💡")} Make sure credentials exist in cloudflared/credentials/`);
    Deno.exit(1);
  }
  
  // Update config
  const success = await updateConfig(tunnelId);
  
  if (success) {
    console.log(`\n${green("✅")} Configuration updated successfully!`);
    console.log(`${cyan("📋")} Next steps:`);
    console.log(`  1. Restart services: deno task restart`);
    console.log(`  2. Verify deployment: deno task verify`);
  } else {
    console.log(`\n${red("❌")} Failed to update configuration`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}