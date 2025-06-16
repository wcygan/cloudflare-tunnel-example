/**
 * Shared command execution utilities for Cloudflare Tunnel scripts
 * 
 * Provides consistent command execution with proper error handling,
 * colored output, and optional failure handling.
 */

import { cyan, green, red } from "https://deno.land/std@0.208.0/fmt/colors.ts";

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface CommandOptions {
  description?: string;
  allowFailure?: boolean;
  suppressOutput?: boolean;
}

/**
 * Execute a command with consistent error handling and logging
 */
export async function runCommand(
  cmd: string[], 
  options: CommandOptions = {}
): Promise<CommandResult> {
  const { description, allowFailure = false, suppressOutput = false } = options;
  
  if (description && !suppressOutput) {
    console.log(`${cyan("→")} ${description}`);
  }
  
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
      if (!suppressOutput) {
        console.log(`  ${green("✓")} Success`);
      }
      return { success: true, output };
    } else {
      if (!suppressOutput && !allowFailure) {
        console.log(`  ${red("✗")} Failed`);
        if (error) console.log(`  ${red("Error:")} ${error.trim()}`);
      }
      return { success: false, output, error };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (!suppressOutput && !allowFailure) {
      console.log(`  ${red("✗")} Exception: ${errorMessage}`);
    }
    return { success: false, output: "", error: errorMessage };
  }
}

/**
 * Execute multiple commands in sequence, stopping on first failure
 */
export async function runCommandSequence(
  commands: Array<{ cmd: string[]; options?: CommandOptions }>
): Promise<CommandResult[]> {
  const results: CommandResult[] = [];
  
  for (const { cmd, options } of commands) {
    const result = await runCommand(cmd, options);
    results.push(result);
    
    if (!result.success && !options?.allowFailure) {
      break;
    }
  }
  
  return results;
}

/**
 * Execute multiple commands in parallel
 */
export async function runCommandsParallel(
  commands: Array<{ cmd: string[]; options?: CommandOptions }>
): Promise<CommandResult[]> {
  const promises = commands.map(({ cmd, options }) => runCommand(cmd, options));
  return await Promise.all(promises);
}