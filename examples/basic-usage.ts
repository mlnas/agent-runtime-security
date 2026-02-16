/**
 * Basic Usage Example
 *
 * Shows the simplest way to integrate the platform — no plugins required.
 */

import { AgentSecurity } from "../core/src";
import * as path from "path";

const security = new AgentSecurity({
  policyPath: path.join(__dirname, "../default-policy.json"),
  defaultEnvironment: "dev",
});

async function main() {
  // Check a tool call before executing
  const result = await security.checkToolCall({
    toolName: "send_email",
    toolArgs: { to: "user@example.com", subject: "Hello" },
    agentId: "email-agent-001",
    environment: "prod",
  });

  if (result.allowed) {
    console.log("✓ Email allowed by policy");
  } else {
    console.log("✗ Email blocked by policy");
    console.log("  Reason:", result.decision.reasons[0].message);
  }

  // Audit trail
  const events = security.getAuditLog();
  console.log(`\nAudit events: ${events.length}`);
  events.forEach((e) => console.log(`  - ${e.outcome}: ${e.tool_name}`));
}

main();
