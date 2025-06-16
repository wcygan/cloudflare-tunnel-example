/**
 * Shared type definitions for Cloudflare Tunnel scripts
 */

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

export interface TunnelInfo {
  id: string;
  name: string;
  hasCredentials: boolean;
  credentialsPath?: string;
}

export interface TunnelConfig {
  activeTunnelId: string;
  tunnelName: string;
  domain: string;
  updatedAt: string;
}

export interface DiagnosticResult {
  tunnels: TunnelInfo[];
  configTunnelId: string | null;
  activeTunnelId: string | null;
  dnsRecords: { [domain: string]: boolean };
  containersRunning: boolean;
  issues: string[];
  recommendations: string[];
}

export interface EndpointTest {
  url: string;
  name: string;
  expectedStatus: number;
  expectedContent?: string;
  timeout: number;
}