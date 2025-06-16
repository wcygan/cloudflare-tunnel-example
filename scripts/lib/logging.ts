/**
 * Shared logging utilities for Cloudflare Tunnel scripts
 * 
 * Provides consistent colored output and formatting across all scripts.
 */

import { cyan, green, red, yellow } from "https://deno.land/std@0.208.0/fmt/colors.ts";

/**
 * Log a step with icon and description
 */
export function logStep(message: string, icon: string = "🔧"): void {
  console.log(`${cyan(icon)} ${message}`);
}

/**
 * Log a success message
 */
export function logSuccess(message: string): void {
  console.log(`${green("✓")} ${message}`);
}

/**
 * Log an error message
 */
export function logError(message: string): void {
  console.log(`${red("✗")} ${message}`);
}

/**
 * Log a warning message
 */
export function logWarning(message: string): void {
  console.log(`${yellow("⚠")} ${message}`);
}

/**
 * Log an info message
 */
export function logInfo(message: string): void {
  console.log(`${cyan("ℹ")} ${message}`);
}

/**
 * Log a section header
 */
export function logSection(title: string): void {
  console.log(cyan(`\n${title}\n`));
}

/**
 * Log a list of items with bullet points
 */
export function logList(items: string[], bullet: string = "•"): void {
  for (const item of items) {
    console.log(`  ${bullet} ${item}`);
  }
}

/**
 * Log recommendations or next steps
 */
export function logRecommendations(recommendations: string[]): void {
  if (recommendations.length > 0) {
    console.log(yellow("\n💡 Recommendations:"));
    logList(recommendations);
  }
}

/**
 * Log issues found
 */
export function logIssues(issues: string[]): void {
  if (issues.length > 0) {
    console.log(red("\n❌ Issues Found:"));
    logList(issues);
  } else {
    console.log(green("\n✅ No issues found!"));
  }
}

/**
 * Log a summary with counts
 */
export function logSummary(successCount: number, totalCount: number, itemName: string = "items"): void {
  console.log(cyan(`📊 Summary:`));
  console.log(`  ${green("✓")} Successful: ${successCount}/${totalCount} ${itemName}`);
  
  if (successCount === totalCount) {
    console.log(green(`\n🎉 All ${itemName} completed successfully!`));
  } else {
    const failedCount = totalCount - successCount;
    console.log(red(`\n❌ ${failedCount} ${itemName} failed.`));
  }
}