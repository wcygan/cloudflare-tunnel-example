#!/usr/bin/env deno run --allow-net

/**
 * Cloudflare Tunnel Endpoint Verification Script
 * 
 * Tests both tunnel endpoints to ensure they're responding correctly:
 * - https://hello.halibut.cc/ (main application)
 * - https://health.halibut.cc/health (health check)
 */

import { cyan, green, red, yellow } from "https://deno.land/std@0.208.0/fmt/colors.ts";

interface EndpointTest {
  url: string;
  name: string;
  expectedStatus: number;
  expectedContent?: string;
  timeout: number;
}

const endpoints: EndpointTest[] = [
  {
    url: "https://halibut.cc/",
    name: "Main Application",
    expectedStatus: 200,
    expectedContent: "Hello World",
    timeout: 10000,
  },
  {
    url: "https://halibut.cc/health",
    name: "Health Check",
    expectedStatus: 200,
    expectedContent: '"status":"healthy"',
    timeout: 10000,
  },
];

async function testEndpoint(endpoint: EndpointTest): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout);
  
  try {
    console.log(`${cyan("Testing:")} ${endpoint.name} (${endpoint.url})`);
    
    const response = await fetch(endpoint.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "cloudflare-tunnel-verification/1.0",
      },
    });
    
    clearTimeout(timeoutId);
    
    // Check status code
    if (response.status !== endpoint.expectedStatus) {
      console.log(`  ${red("✗")} Status: ${response.status} (expected ${endpoint.expectedStatus})`);
      return false;
    }
    
    console.log(`  ${green("✓")} Status: ${response.status}`);
    
    // Check content if specified
    if (endpoint.expectedContent) {
      const text = await response.text();
      if (!text.includes(endpoint.expectedContent)) {
        console.log(`  ${red("✗")} Content: Missing expected text "${endpoint.expectedContent}"`);
        return false;
      }
      console.log(`  ${green("✓")} Content: Contains expected text`);
    }
    
    // Check response headers
    const server = response.headers.get("server");
    if (server?.includes("cloudflare")) {
      console.log(`  ${green("✓")} Routing: Through Cloudflare tunnel`);
    } else {
      console.log(`  ${yellow("⚠")} Routing: May not be through Cloudflare (server: ${server})`);
    }
    
    return true;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === "AbortError") {
      console.log(`  ${red("✗")} Timeout: No response within ${endpoint.timeout}ms`);
    } else if (error.message.includes("ENOTFOUND") || error.message.includes("DNS")) {
      console.log(`  ${red("✗")} DNS: Cannot resolve hostname`);
    } else if (error.message.includes("ECONNREFUSED")) {
      console.log(`  ${red("✗")} Connection: Refused (tunnel may be down)`);
    } else {
      console.log(`  ${red("✗")} Error: ${error.message}`);
    }
    
    return false;
  }
}

async function verifyDeployment(): Promise<void> {
  console.log(cyan("🔍 Verifying Cloudflare Tunnel Deployment\n"));
  
  const results: boolean[] = [];
  
  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint);
    results.push(success);
    console.log(); // Empty line between tests
  }
  
  // Summary
  const successCount = results.filter(Boolean).length;
  const totalCount = results.length;
  
  console.log(cyan("📊 Verification Summary:"));
  console.log(`  ${green("✓")} Successful: ${successCount}/${totalCount}`);
  
  if (successCount === totalCount) {
    console.log(`\n${green("🎉 All endpoints are working correctly!")}`);
    console.log("Your Cloudflare tunnel deployment is successful.");
  } else {
    console.log(`\n${red("❌ Some endpoints failed verification.")}`);
    console.log("Check the tunnel configuration and container status:");
    console.log("  • deno task ps");
    console.log("  • deno task logs");
    console.log("  • See TROUBLESHOOTING.md for common issues");
    Deno.exit(1);
  }
}

async function checkPrerequisites(): Promise<boolean> {
  console.log(yellow("🔧 Checking prerequisites...\n"));
  
  try {
    // Check if we can resolve Cloudflare's edge
    const response = await fetch("https://cloudflare.com/cdn-cgi/trace", {
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      console.log(`${green("✓")} Internet connectivity: OK`);
      return true;
    } else {
      console.log(`${red("✗")} Internet connectivity: Failed`);
      return false;
    }
  } catch {
    console.log(`${red("✗")} Internet connectivity: No internet access`);
    return false;
  }
}

// Main execution
if (import.meta.main) {
  try {
    const prereqsOK = await checkPrerequisites();
    
    if (!prereqsOK) {
      console.log(red("\nCannot proceed without internet connectivity."));
      Deno.exit(1);
    }
    
    console.log(); // Empty line
    await verifyDeployment();
    
  } catch (error) {
    console.error(red(`Fatal error: ${error.message}`));
    Deno.exit(1);
  }
}