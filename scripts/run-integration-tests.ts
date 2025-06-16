#!/usr/bin/env deno run --allow-all

/**
 * Integration Test Runner
 * 
 * Orchestrates all integration tests for the Cloudflare Tunnel Example project.
 * Runs tests in appropriate order with proper setup and teardown.
 */

import { cyan, green, red, yellow, bold } from "https://deno.land/std@0.208.0/fmt/colors.ts";
import { $ } from "https://deno.land/x/dax@0.39.2/mod.ts";

interface TestSuite {
  name: string;
  command: string[];
  type: "unit" | "integration" | "e2e";
  requiresDocker?: boolean;
  requiresNetwork?: boolean;
  timeout?: number;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: "Rust Unit Tests",
    command: ["cargo", "test"],
    type: "unit",
    timeout: 60_000,
  },
  {
    name: "Configuration Validation",
    command: ["deno", "test", "tests/config_validation_test.ts", "--allow-read"],
    type: "unit",
    timeout: 30_000,
  },
  {
    name: "Docker Integration Tests",
    command: ["deno", "test", "tests/docker_integration_test.ts", "--allow-run", "--allow-net", "--allow-read", "--allow-env"],
    type: "integration",
    requiresDocker: true,
    timeout: 300_000, // 5 minutes for all Docker tests
  },
  {
    name: "Local Connectivity Test",
    command: ["bash", "test-local.sh"],
    type: "integration",
    requiresDocker: true,
    timeout: 60_000,
  },
  {
    name: "Endpoint Verification (if deployed)",
    command: ["deno", "run", "--allow-net", "scripts/verify-endpoints.ts"],
    type: "e2e",
    requiresNetwork: true,
    timeout: 30_000,
  },
];

async function checkPrerequisites(): Promise<boolean> {
  console.log(cyan("🔍 Checking prerequisites...\n"));
  
  let allGood = true;
  
  // Check Docker
  try {
    await $`docker --version`.quiet();
    console.log(green("✓") + " Docker is installed");
  } catch {
    console.log(red("✗") + " Docker is not installed or not in PATH");
    allGood = false;
  }
  
  // Check Docker daemon
  try {
    await $`docker info`.quiet();
    console.log(green("✓") + " Docker daemon is running");
  } catch {
    console.log(red("✗") + " Docker daemon is not running");
    allGood = false;
  }
  
  // Check Cargo
  try {
    await $`cargo --version`.quiet();
    console.log(green("✓") + " Rust/Cargo is installed");
  } catch {
    console.log(red("✗") + " Rust/Cargo is not installed");
    allGood = false;
  }
  
  // Check Deno (should always pass since we're running in Deno)
  console.log(green("✓") + " Deno is installed");
  
  return allGood;
}

async function ensureCleanDockerState(): Promise<void> {
  console.log(cyan("\n🧹 Ensuring clean Docker state...\n"));
  
  try {
    // Stop any running containers
    await $`docker compose down -v`.quiet();
    console.log(green("✓") + " Docker containers cleaned up");
  } catch {
    // Ignore errors - containers might not be running
  }
  
  // Wait a bit for cleanup
  await new Promise(resolve => setTimeout(resolve, 2000));
}

async function runTestSuite(suite: TestSuite): Promise<boolean> {
  console.log(bold(cyan(`\n📋 Running: ${suite.name}`)));
  console.log(`Type: ${suite.type} | Timeout: ${(suite.timeout || 60000) / 1000}s\n`);
  
  const startTime = performance.now();
  
  try {
    const timeout = suite.timeout || 60_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const result = await $`${suite.command}`.signal(controller.signal);
    
    clearTimeout(timeoutId);
    
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(green(`\n✅ ${suite.name} passed in ${duration}s`));
    
    return true;
  } catch (error) {
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    
    if (error.name === "AbortError") {
      console.log(red(`\n❌ ${suite.name} timed out after ${duration}s`));
    } else {
      console.log(red(`\n❌ ${suite.name} failed after ${duration}s`));
      if (error.message) {
        console.log(red(`Error: ${error.message}`));
      }
    }
    
    return false;
  }
}

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  suites: {
    name: string;
    status: "passed" | "failed" | "skipped";
    duration?: number;
  }[];
}

async function generateReport(results: TestResults): Promise<void> {
  const timestamp = new Date().toISOString();
  const reportPath = `test-results-${timestamp.replace(/[:.]/g, "-")}.json`;
  
  await Deno.writeTextFile(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Test report saved to: ${reportPath}`);
}

async function main() {
  console.log(bold(cyan("🧪 Cloudflare Tunnel Example - Integration Test Runner\n")));
  
  // Check prerequisites
  const prereqsOk = await checkPrerequisites();
  if (!prereqsOk) {
    console.log(red("\n❌ Prerequisites check failed. Please install missing dependencies."));
    Deno.exit(1);
  }
  
  // Parse command line arguments
  const args = Deno.args;
  const runE2E = args.includes("--e2e");
  const suiteFilter = args.find(arg => arg.startsWith("--suite="))?.split("=")[1];
  
  // Clean Docker state before integration tests
  await ensureCleanDockerState();
  
  // Run test suites
  const results: TestResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    suites: [],
  };
  
  const startTime = performance.now();
  
  for (const suite of TEST_SUITES) {
    // Skip E2E tests unless explicitly requested
    if (suite.type === "e2e" && !runE2E) {
      console.log(yellow(`\n⏭️  Skipping ${suite.name} (use --e2e to run)`));
      results.skipped++;
      results.suites.push({ name: suite.name, status: "skipped" });
      continue;
    }
    
    // Filter by suite name if specified
    if (suiteFilter && !suite.name.toLowerCase().includes(suiteFilter.toLowerCase())) {
      continue;
    }
    
    results.total++;
    
    const suiteStartTime = performance.now();
    const passed = await runTestSuite(suite);
    const suiteDuration = performance.now() - suiteStartTime;
    
    if (passed) {
      results.passed++;
      results.suites.push({ 
        name: suite.name, 
        status: "passed", 
        duration: suiteDuration 
      });
    } else {
      results.failed++;
      results.suites.push({ 
        name: suite.name, 
        status: "failed", 
        duration: suiteDuration 
      });
      
      // For integration tests, clean up after failure
      if (suite.requiresDocker) {
        await ensureCleanDockerState();
      }
    }
  }
  
  results.duration = performance.now() - startTime;
  
  // Print summary
  console.log(bold(cyan("\n📊 Test Summary\n")));
  console.log(`Total:   ${results.total}`);
  console.log(`Passed:  ${green(results.passed.toString())}`);
  console.log(`Failed:  ${results.failed > 0 ? red(results.failed.toString()) : "0"}`);
  console.log(`Skipped: ${results.skipped > 0 ? yellow(results.skipped.toString()) : "0"}`);
  console.log(`Duration: ${(results.duration / 1000).toFixed(2)}s`);
  
  // Generate report
  await generateReport(results);
  
  // Exit with appropriate code
  if (results.failed > 0) {
    console.log(red("\n❌ Some tests failed!"));
    Deno.exit(1);
  } else {
    console.log(green("\n✅ All tests passed!"));
    Deno.exit(0);
  }
}

// Add help text
if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
  console.log(`
${bold("Integration Test Runner")}

${cyan("Usage:")}
  deno task test:integration [options]

${cyan("Options:")}
  --e2e              Run end-to-end tests (requires deployed tunnel)
  --suite=<name>     Run only test suites matching the given name
  --help, -h         Show this help message

${cyan("Examples:")}
  deno run --allow-all scripts/run-integration-tests.ts
  deno run --allow-all scripts/run-integration-tests.ts --e2e
  deno run --allow-all scripts/run-integration-tests.ts --suite=docker
`);
  Deno.exit(0);
}

// Run tests
await main();