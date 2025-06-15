#!/usr/bin/env deno run --allow-run --allow-read --allow-net

/**
 * Cloudflare Tunnel Diagnostics Script
 * 
 * Analyzes the current state of your tunnel configuration and provides
 * recommendations for fixing any issues found.
 */

import { cyan, green, red, yellow } from "https://deno.land/std@0.208.0/fmt/colors.ts";

interface TunnelInfo {
  id: string;
  name: string;
  hasCredentials: boolean;
  credentialsPath?: string;
}

interface DiagnosticResult {
  tunnels: TunnelInfo[];
  configTunnelId: string | null;
  activeTunnelId: string | null;
  dnsRecords: { [domain: string]: boolean };
  containersRunning: boolean;
  issues: string[];
  recommendations: string[];
}

async function runCommand(cmd: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const process = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: "piped",
      stderr: "piped",
    });
    
    const result = await process.output();
    const output = new TextDecoder().decode(result.stdout);
    const error = new TextDecoder().decode(result.stderr);
    
    return { success: result.success, output, error };
  } catch (err) {
    return { success: false, output: "", error: err.message };
  }
}

async function getTunnelList(): Promise<TunnelInfo[]> {
  console.log(`${cyan("🔍")} Checking Cloudflare tunnels...`);
  
  const result = await runCommand([
    "docker", "run", "--rm", 
    "-v", "./cloudflared:/home/nonroot/.cloudflared", 
    "cloudflare/cloudflared:latest", 
    "tunnel", "list"
  ]);
  
  if (!result.success) {
    console.log(`  ${red("✗")} Failed to list tunnels`);
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

async function getConfigTunnelId(): Promise<string | null> {
  console.log(`${cyan("📄")} Reading tunnel configuration...`);
  
  try {
    const config = await Deno.readTextFile("cloudflared/config.yml");
    const match = config.match(/tunnel:\s*([a-f0-9-]+)/);
    return match ? match[1] : null;
  } catch {
    console.log(`  ${red("✗")} Failed to read config.yml`);
    return null;
  }
}

async function checkDNS(domain: string): Promise<boolean> {
  console.log(`${cyan("🌐")} Checking DNS for ${domain}...`);
  
  try {
    const response = await fetch(`https://dns.google/resolve?name=${domain}&type=A`, {
      signal: AbortSignal.timeout(5000),
    });
    
    const data = await response.json();
    return data.Status === 0 && data.Answer && data.Answer.length > 0;
  } catch {
    return false;
  }
}

async function checkContainers(): Promise<boolean> {
  console.log(`${cyan("🐳")} Checking Docker containers...`);
  
  const result = await runCommand(["docker", "ps", "--format", "{{.Names}}"]);
  
  if (!result.success) {
    return false;
  }
  
  const containers = result.output.toLowerCase();
  return containers.includes("cloudflare-tunnel-app") && containers.includes("cloudflare-tunnel");
}

async function getActiveTunnelId(): Promise<string | null> {
  // Check for tunnel config file first
  try {
    const configData = await Deno.readTextFile(".tunnel-config.json");
    const config = JSON.parse(configData);
    return config.activeTunnelId || null;
  } catch {
    // No config file, try to detect from credentials
  }
  
  // Check credentials directory
  try {
    const entries = [];
    for await (const entry of Deno.readDir("cloudflared/credentials")) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        entries.push(entry.name);
      }
    }
    
    if (entries.length === 1) {
      return entries[0].replace(".json", "");
    }
  } catch {
    // No credentials directory
  }
  
  return null;
}

async function diagnose(): Promise<DiagnosticResult> {
  const result: DiagnosticResult = {
    tunnels: [],
    configTunnelId: null,
    activeTunnelId: null,
    dnsRecords: {},
    containersRunning: false,
    issues: [],
    recommendations: [],
  };
  
  // Get tunnel list
  result.tunnels = await getTunnelList();
  
  // Get config tunnel ID
  result.configTunnelId = await getConfigTunnelId();
  
  // Get active tunnel ID
  result.activeTunnelId = await getActiveTunnelId();
  
  // Check DNS
  result.dnsRecords["halibut.cc"] = await checkDNS("halibut.cc");
  
  // Check containers
  result.containersRunning = await checkContainers();
  
  // Analyze issues
  if (result.tunnels.length === 0) {
    result.issues.push("No tunnels found");
    result.recommendations.push("Run: deno task tunnel:create");
  } else if (result.tunnels.length > 1) {
    const sameNameTunnels = result.tunnels.filter(t => t.name === "cloudflare-tunnel-example");
    if (sameNameTunnels.length > 1) {
      result.issues.push("Multiple tunnels with same name 'cloudflare-tunnel-example'");
      result.recommendations.push("Delete old tunnels or use unique names");
    }
  }
  
  // Check tunnel with credentials
  const tunnelsWithCreds = result.tunnels.filter(t => t.hasCredentials);
  if (tunnelsWithCreds.length === 0) {
    result.issues.push("No tunnel has credentials");
    result.recommendations.push("Run tunnel creation to generate credentials");
  } else if (tunnelsWithCreds.length > 1) {
    result.issues.push("Multiple tunnels have credentials");
    result.recommendations.push("Clean up old tunnel credentials");
  }
  
  // Check config mismatch
  if (result.configTunnelId && tunnelsWithCreds.length === 1) {
    if (result.configTunnelId !== tunnelsWithCreds[0].id) {
      result.issues.push(`Config tunnel ID (${result.configTunnelId}) doesn't match tunnel with credentials (${tunnelsWithCreds[0].id})`);
      result.recommendations.push(`Update config.yml to use tunnel ID: ${tunnelsWithCreds[0].id}`);
    }
  }
  
  // Check DNS
  if (!result.dnsRecords["halibut.cc"]) {
    result.issues.push("DNS record for halibut.cc not found");
    result.recommendations.push("Run: deno task tunnel:route");
  }
  
  // Check containers
  if (!result.containersRunning) {
    result.issues.push("Containers not running");
    result.recommendations.push("Run: deno task up");
  }
  
  return result;
}

function printDiagnostics(result: DiagnosticResult): void {
  console.log(cyan("\n📊 Diagnostic Results\n"));
  
  // Tunnels
  console.log(cyan("🚇 Tunnels:"));
  if (result.tunnels.length === 0) {
    console.log(`  ${red("✗")} No tunnels found`);
  } else {
    for (const tunnel of result.tunnels) {
      const status = tunnel.hasCredentials ? green("✓") : red("✗");
      console.log(`  ${status} ${tunnel.name} (${tunnel.id})`);
      if (tunnel.hasCredentials) {
        console.log(`    ${green("→")} Credentials: ${tunnel.credentialsPath}`);
      }
    }
  }
  
  // Configuration
  console.log(cyan("\n⚙️  Configuration:"));
  console.log(`  Config tunnel ID: ${result.configTunnelId || red("Not found")}`);
  console.log(`  Active tunnel ID: ${result.activeTunnelId || red("Not detected")}`);
  
  // DNS
  console.log(cyan("\n🌐 DNS Records:"));
  for (const [domain, exists] of Object.entries(result.dnsRecords)) {
    const status = exists ? green("✓") : red("✗");
    console.log(`  ${status} ${domain}`);
  }
  
  // Containers
  console.log(cyan("\n🐳 Container Status:"));
  const containerStatus = result.containersRunning ? green("✓ Running") : red("✗ Not running");
  console.log(`  ${containerStatus}`);
  
  // Issues
  if (result.issues.length > 0) {
    console.log(red("\n❌ Issues Found:"));
    for (const issue of result.issues) {
      console.log(`  • ${issue}`);
    }
  } else {
    console.log(green("\n✅ No issues found!"));
  }
  
  // Recommendations
  if (result.recommendations.length > 0) {
    console.log(yellow("\n💡 Recommendations:"));
    for (const rec of result.recommendations) {
      console.log(`  • ${rec}`);
    }
  }
  
  // Quick fix command
  if (result.issues.length > 0) {
    console.log(cyan("\n🔧 Quick Fix Commands:"));
    
    // Config mismatch
    if (result.issues.some(i => i.includes("Config tunnel ID"))) {
      const tunnel = result.tunnels.find(t => t.hasCredentials);
      if (tunnel) {
        console.log(`  1. Update config: deno run --allow-read --allow-write scripts/update-config.ts ${tunnel.id}`);
      }
    }
    
    // DNS missing
    if (result.issues.some(i => i.includes("DNS record"))) {
      console.log(`  2. Setup DNS: deno task tunnel:route`);
    }
    
    // Containers not running
    if (!result.containersRunning) {
      console.log(`  3. Start services: deno task up`);
    }
  }
}

async function main(): Promise<void> {
  console.log(cyan("🔍 Cloudflare Tunnel Diagnostics\n"));
  
  try {
    const result = await diagnose();
    printDiagnostics(result);
    
    // Exit with error if issues found
    if (result.issues.length > 0) {
      Deno.exit(1);
    }
  } catch (error) {
    console.error(red(`\n💥 Diagnostic failed: ${error.message}`));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}