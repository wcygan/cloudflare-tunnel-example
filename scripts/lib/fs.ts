/**
 * Shared file system utilities for Cloudflare Tunnel scripts
 * 
 * Provides consistent file operations and path handling.
 */

/**
 * Check if a file exists at the given path
 */
export async function checkFileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(path: string): Promise<void> {
  try {
    await Deno.stat(path);
  } catch {
    await Deno.mkdir(path, { recursive: true });
  }
}

/**
 * Read a file and return its contents, with optional default value
 */
export async function readFileWithDefault(
  path: string, 
  defaultValue: string = ""
): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return defaultValue;
  }
}

/**
 * Write content to a file, ensuring the directory exists
 */
export async function writeFileEnsureDir(
  path: string, 
  content: string
): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf('/'));
  if (dir) {
    await ensureDir(dir);
  }
  await Deno.writeTextFile(path, content);
}

/**
 * Get all files in a directory with a specific extension
 */
export async function getFilesWithExtension(
  dirPath: string, 
  extension: string
): Promise<string[]> {
  const files: string[] = [];
  
  try {
    for await (const entry of Deno.readDir(dirPath)) {
      if (entry.isFile && entry.name.endsWith(extension)) {
        files.push(entry.name);
      }
    }
  } catch {
    // Directory doesn't exist or is not accessible
  }
  
  return files;
}