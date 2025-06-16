/**
 * Shared tunnel management utilities for Cloudflare Tunnel scripts
 * 
 * Provides consistent tunnel operations and configuration management.
 */

import { runCommand } from "./command.ts";
import { checkFileExists, getFilesWithExtension } from "./fs.ts";

export interface TunnelInfo {
  id: string;
  name: string;
  hasCredentials: boolean;
  credentialsPath?: string;
}

/**
 * Get the active tunnel ID from configuration or credentials
 */
export async function getActiveTunnelId(): Promise<string | null> {
  // Check for tunnel config file first
  try {
    const configData = await Deno.readTextFile(".tunnel-config.json");
    const config = JSON.parse(configData);
    return config.activeTunnelId || null;
  } catch {
    // No config file, try to detect from credentials
  }
  
  // Check credentials directory
  const credentialFiles = await getFilesWithExtension("cloudflared/credentials", ".json");
  
  if (credentialFiles.length === 1) {
    return credentialFiles[0].replace(".json", "");
  }
  
  return null;
}

/**
 * Get all tunnel credential IDs from the credentials directory
 */
export async function getCredentialTunnelIds(): Promise<string[]> {
  const credentialFiles = await getFilesWithExtension("cloudflared/credentials", ".json");
  return credentialFiles.map(file => file.replace(".json", ""));
}

/**
 * Ensure tunnel credentials are in the correct location
 * Returns the tunnel ID if credentials were moved
 */
export async function ensureCredentialsInCorrectLocation(): Promise<string | null> {
  const { logStep, logSuccess, logWarning } = await import("./logging.ts");
  
  logStep("Checking credentials location...", "🔧");
  
  // Ensure credentials directory exists
  try {
    await Deno.stat("cloudflared/credentials");
  } catch {
    await Deno.mkdir("cloudflared/credentials", { recursive: true });
    logSuccess("Created credentials directory");
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
          logSuccess(`Moved ${entry.name} to credentials/`);
          movedTunnelId = entry.name.replace(".json", "");
        }
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logWarning(`Could not check for credentials files: ${errorMessage}`);
  }
  
  return movedTunnelId;
}

/**
 * Get list of all tunnels with their credential status
 */
export async function getTunnelList(): Promise<TunnelInfo[]> {
  const result = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "list"
  ], { suppressOutput: true });
  
  if (!result.success) {
    return [];
  }
  
  const tunnels: TunnelInfo[] = [];
  const lines = result.output.split('\n');
  
  for (const line of lines) {
    // Parse tunnel list output
    const match = line.match(/^([a-f0-9-]+)\s+(\S+)\s+/);
    if (match) {
      const id = match[1];
      const name = match[2];
      
      // Check if credentials exist
      let hasCredentials = false;
      let credentialsPath: string | undefined;
      
      try {
        const credPath = `cloudflared/credentials/${id}.json`;
        await Deno.stat(credPath);
        hasCredentials = true;
        credentialsPath = credPath;
      } catch {
        // Credentials not found
      }
      
      tunnels.push({ id, name, hasCredentials, credentialsPath });
    }
  }
  
  return tunnels;
}

/**
 * Validate tunnel ID format
 */
export function isValidTunnelId(tunnelId: string): boolean {
  return /^[a-f0-9-]{36}$/.test(tunnelId);
}