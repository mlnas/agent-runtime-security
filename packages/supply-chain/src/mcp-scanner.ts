/**
 * MCP Scanner — parse MCP server manifests and flag security risks.
 */

export interface McpServerManifest {
  name: string;
  version?: string;
  source?: string; // URL or local path
  permissions?: string[];
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, any>;
  }>;
  verified?: boolean;
  publisher?: string;
}

export type RiskLevel = "critical" | "high" | "medium" | "low" | "info";

export interface ScanFinding {
  rule: string;
  level: RiskLevel;
  message: string;
  detail?: string;
}

export interface ScanReport {
  server_name: string;
  scan_timestamp: string;
  findings: ScanFinding[];
  risk_score: number; // 0-100
  recommendation: "block" | "review" | "allow";
}

/** Permissions considered high-risk for MCP servers */
const HIGH_RISK_PERMISSIONS = new Set([
  "filesystem.write",
  "network.outbound",
  "process.spawn",
  "env.read",
  "shell.execute",
  "database.admin",
]);

const MEDIUM_RISK_PERMISSIONS = new Set([
  "filesystem.read",
  "network.inbound",
  "clipboard.write",
  "browser.navigate",
]);

/**
 * McpScanner — scans MCP server manifests for security risks.
 */
export class McpScanner {
  /**
   * Scan an MCP server manifest and produce a risk report.
   */
  scan(manifest: McpServerManifest): ScanReport {
    const findings: ScanFinding[] = [];

    // Check for missing metadata
    if (!manifest.version) {
      findings.push({
        rule: "MISSING_VERSION",
        level: "medium",
        message: "MCP server has no version specified",
      });
    }

    if (!manifest.publisher) {
      findings.push({
        rule: "MISSING_PUBLISHER",
        level: "medium",
        message: "MCP server has no publisher specified",
      });
    }

    if (!manifest.source) {
      findings.push({
        rule: "MISSING_SOURCE",
        level: "high",
        message: "MCP server has no source URL — cannot verify provenance",
      });
    }

    // Check for unverified source
    if (!manifest.verified) {
      findings.push({
        rule: "UNVERIFIED_SERVER",
        level: "high",
        message: "MCP server is not verified",
      });
    }

    // Check permissions
    const permissions = manifest.permissions || [];
    if (permissions.length === 0) {
      findings.push({
        rule: "NO_PERMISSIONS_DECLARED",
        level: "info",
        message: "No permissions declared — may be under-declaring",
      });
    }

    for (const perm of permissions) {
      if (HIGH_RISK_PERMISSIONS.has(perm)) {
        findings.push({
          rule: "HIGH_RISK_PERMISSION",
          level: "high",
          message: `High-risk permission: ${perm}`,
          detail: `MCP server "${manifest.name}" requests "${perm}" which allows broad system access`,
        });
      } else if (MEDIUM_RISK_PERMISSIONS.has(perm)) {
        findings.push({
          rule: "MEDIUM_RISK_PERMISSION",
          level: "medium",
          message: `Medium-risk permission: ${perm}`,
        });
      }
    }

    // Excessive permissions check
    const highRiskCount = permissions.filter((p) => HIGH_RISK_PERMISSIONS.has(p)).length;
    if (highRiskCount >= 3) {
      findings.push({
        rule: "EXCESSIVE_PERMISSIONS",
        level: "critical",
        message: `Server requests ${highRiskCount} high-risk permissions — potential over-privileged server`,
      });
    }

    // Check for potentially dangerous tools
    if (manifest.tools) {
      for (const tool of manifest.tools) {
        if (/exec|shell|eval|spawn|system/i.test(tool.name)) {
          findings.push({
            rule: "DANGEROUS_TOOL_NAME",
            level: "high",
            message: `Tool "${tool.name}" has a potentially dangerous name pattern`,
          });
        }
      }
    }

    // Compute risk score
    const riskScore = this.computeRiskScore(findings);
    const recommendation = riskScore >= 70 ? "block" : riskScore >= 40 ? "review" : "allow";

    return {
      server_name: manifest.name,
      scan_timestamp: new Date().toISOString(),
      findings,
      risk_score: riskScore,
      recommendation,
    };
  }

  /**
   * Scan multiple MCP servers and return all reports.
   */
  scanAll(manifests: McpServerManifest[]): ScanReport[] {
    return manifests.map((m) => this.scan(m));
  }

  private computeRiskScore(findings: ScanFinding[]): number {
    let score = 0;
    for (const finding of findings) {
      switch (finding.level) {
        case "critical": score += 30; break;
        case "high": score += 15; break;
        case "medium": score += 8; break;
        case "low": score += 3; break;
        case "info": score += 1; break;
      }
    }
    return Math.min(100, score);
  }
}
