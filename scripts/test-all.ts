#!/usr/bin/env deno run --allow-all

/**
 * Simple test runner for all integration tests
 */

import { green, red, yellow, cyan } from "https://deno.land/std@0.208.0/fmt/colors.ts";

console.log(cyan("🧪 Running Cloudflare Tunnel Integration Tests\n"));

// Run Rust unit tests
console.log(cyan("📋 Running Rust Unit Tests..."));
const cargoTest = new Deno.Command("cargo", {
  args: ["test"],
  stdout: "piped",
  stderr: "piped",
});

const cargoResult = await cargoTest.output();
if (cargoResult.success) {
  console.log(green("✅ Rust tests passed\n"));
} else {
  console.log(red("❌ Rust tests failed"));
  console.log(new TextDecoder().decode(cargoResult.stderr));
}

// Run Deno tests
console.log(cyan("📋 Running Deno Tests..."));
const denoTest = new Deno.Command("deno", {
  args: ["test", "--allow-all", "tests/"],
  stdout: "piped",
  stderr: "piped",
});

const denoResult = await denoTest.output();
const denoOutput = new TextDecoder().decode(denoResult.stdout);
const denoError = new TextDecoder().decode(denoResult.stderr);

console.log(denoOutput);
if (denoError) {
  console.log(red(denoError));
}

if (denoResult.success) {
  console.log(green("\n✅ All tests passed!"));
} else {
  console.log(red("\n❌ Some tests failed"));
  Deno.exit(1);
}