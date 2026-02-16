/**
 * Demo 02: Egress Control + DLP
 *
 * Shows: Agent tries to email customer PII → egress enforcer classifies as PII
 * → checks destination policy → blocks → generates compliance report.
 */

import { AgentSecurity, PolicyBundle } from "@agent-security/core";
import {
  egressEnforcer,
  ComplianceReporter,
  EgressPolicy,
  ToolChannelMapping,
} from "@agent-security/egress";

async function main() {
  console.log("=== Egress Control + DLP Demo ===\n");

  // --- Egress policy: no PII via email, no secrets anywhere ---
  const egressPolicy: EgressPolicy = {
    rules: [
      {
        id: "BLOCK_PII_EMAIL",
        description: "Block PII from being sent via email",
        classifications: ["PII"],
        channels: ["email"],
        action: "block",
      },
      {
        id: "BLOCK_PCI_ALL",
        description: "Block PCI data from all egress channels",
        classifications: ["PCI"],
        action: "block",
      },
      {
        id: "BLOCK_SECRETS_ALL",
        description: "Block secrets from all egress channels",
        classifications: ["SECRET"],
        action: "block",
      },
      {
        id: "ALLOW_PII_INTERNAL",
        description: "Allow PII to internal DB queries",
        classifications: ["PII"],
        channels: ["db_query"],
        allowed_destinations: ["*.internal.company.com"],
        action: "block",
      },
    ],
    default_action: "allow",
  };

  const toolChannelMappings: ToolChannelMapping[] = [
    { tool_name: "send_email", channel: "email", destination_field: "to" },
    { tool_name: "query_*", channel: "db_query", destination_field: "database" },
    { tool_name: "write_file", channel: "file_write", destination_field: "path" },
    { tool_name: "http_request", channel: "http_request", destination_field: "url" },
  ];

  // --- Set up enforcer ---
  const enforcer = egressEnforcer({
    policy: egressPolicy,
    toolChannelMappings,
    onBlocked: (event) => {
      console.log(`  [DLP BLOCKED] ${event.agent_id} → ${event.tool_name} (${event.channel})`);
      console.log(`    Classifications: ${event.classifications.map(c => `${c.label} [${c.classification}]`).join(", ")}`);
    },
    onEgressEvent: (event) => {
      if (!event.blocked) {
        console.log(`  [DLP ALLOWED] ${event.agent_id} → ${event.tool_name} (${event.channel})`);
      }
    },
  });

  // --- Policy bundle (simple allow-all, egress enforcer does the work) ---
  const policyBundle: PolicyBundle = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    rules: [
      { id: "ALLOW_ALL", description: "Allow all (egress enforcer handles DLP)", match: { tool_name: "*", environment: "*" }, outcome: "ALLOW" },
    ],
    defaults: { outcome: "ALLOW" },
  };

  const security = new AgentSecurity({
    policyBundle,
    plugins: [enforcer],
    onDeny: (req, decision) => {
      console.log(`  [DENIED] ${decision.reasons.map(r => r.message).join("; ")}`);
    },
  });

  // --- Scenario 1: Agent tries to email PII ---
  console.log("--- Scenario 1: Email with PII (SSN + email) ---");
  await security.checkToolCall({
    toolName: "send_email",
    toolArgs: {
      to: "customer@external.com",
      subject: "Account Info",
      body: "Dear John, your SSN is 123-45-6789 and your email is john@example.com",
    },
    agentId: "support-bot",
    environment: "prod",
  });

  // --- Scenario 2: Agent tries to email PCI data ---
  console.log("\n--- Scenario 2: Email with credit card number ---");
  await security.checkToolCall({
    toolName: "send_email",
    toolArgs: {
      to: "billing@company.com",
      subject: "Payment update",
      body: "Card: 4111-1111-1111-1111, Exp: 12/25",
    },
    agentId: "billing-bot",
    environment: "prod",
  });

  // --- Scenario 3: Agent tries to send API key via HTTP ---
  console.log("\n--- Scenario 3: HTTP request with API key ---");
  await security.checkToolCall({
    toolName: "http_request",
    toolArgs: {
      url: "https://external-api.com/webhook",
      body: "token=REDACTED",
    },
    agentId: "integration-bot",
    environment: "prod",
  });

  // --- Scenario 4: Clean email (no sensitive data) ---
  console.log("\n--- Scenario 4: Clean email (no sensitive data) ---");
  await security.checkToolCall({
    toolName: "send_email",
    toolArgs: {
      to: "team@company.com",
      subject: "Meeting reminder",
      body: "Don't forget the standup at 10am tomorrow!",
    },
    agentId: "scheduler-bot",
    environment: "prod",
  });

  // --- Generate compliance report ---
  console.log("\n--- Compliance Report ---");
  const reporter = new ComplianceReporter();
  const report = reporter.generateReport(enforcer.getEgressLog());

  console.log(`  Total egress events: ${report.summary.total_events}`);
  console.log(`  Blocked: ${report.summary.blocked_events}`);
  console.log(`  Allowed: ${report.summary.allowed_events}`);
  console.log(`  Classifications detected:`, report.summary.classifications_detected);
  console.log(`  No PII egress: ${report.evidence.no_pii_egress}`);
  console.log(`  No PCI egress: ${report.evidence.no_pci_egress}`);
  console.log(`  No secrets egress: ${report.evidence.no_secrets_egress}`);

  if (report.data_flow_map.length > 0) {
    console.log("\n  Data flow map:");
    for (const flow of report.data_flow_map) {
      console.log(`    ${flow.agent_id} → ${flow.tool_name} (${flow.channel}) [${flow.classifications.join(", ")}] ${flow.blocked ? "BLOCKED" : "ALLOWED"} (${flow.count}x)`);
    }
  }

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);
