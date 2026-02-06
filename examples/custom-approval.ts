/**
 * Custom Approval Workflow Example
 *
 * Shows how to integrate with your own approval system + timeout support.
 */

import { AgentSecurity } from "../core/src";
import * as path from "path";

const security = new AgentSecurity({
  policyPath: path.join(__dirname, "../default-policy.json"),
  approvalTimeoutMs: 5_000, // 5 second timeout

  onApprovalRequired: async (request, decision) => {
    console.log("\n📋 Approval Request:");
    console.log(`   Tool: ${request.action.tool_name}`);
    console.log(`   Agent: ${request.agent.agent_id}`);
    console.log(`   Approver: ${decision.approver_role || "any"}`);

    // In production: send Slack message, email, etc.
    // For demo: auto-approve after a short delay
    await new Promise((r) => setTimeout(r, 500));
    console.log("   ✓ Auto-approved for demo");
    return true;
  },

  onDeny: (_, decision) => {
    console.log("🚨 DENIED:", decision.reasons[0].message);
  },
});

async function main() {
  // This triggers the approval workflow
  const result = await security.checkToolCall({
    toolName: "trigger_payment",
    toolArgs: { amount: 5000, currency: "USD", recipient: "vendor@co.com" },
    agentId: "payment-agent",
    environment: "prod",
  });

  console.log(`\nResult: ${result.allowed ? "✓ Approved" : "✗ Denied"}`);
}

main();
