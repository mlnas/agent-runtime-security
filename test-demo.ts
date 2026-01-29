#!/usr/bin/env ts-node

import { AgentSecurity } from "./core/src/sdk";

/**
 * Quick 3-scenario demo for live demonstrations
 */

const security = new AgentSecurity({
  policyPath: "./default-policy.json",
  
  onApprovalRequired: async (request, decision) => {
    console.log("⏳ APPROVAL REQUIRED");
    console.log(`   Reason: ${decision.reasons[0]?.code}`);
    console.log(`   Message: ${decision.reasons[0]?.message}`);
    return false; // Auto-reject for this simple demo
  },
  
  onDeny: (request, decision) => {
    console.log("✗ DENIED");
    console.log(`   Reason: ${decision.reasons[0]?.code}`);
    console.log(`   Message: ${decision.reasons[0]?.message}`);
  },
  
  onAllow: (request, decision) => {
    console.log("✓ ALLOWED");
    console.log(`   Reason: ${decision.reasons[0]?.code}`);
    console.log(`   Message: ${decision.reasons[0]?.message}`);
  },
});

async function main() {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   Agent Runtime Security - Quick Demo         ║");
  console.log("╚════════════════════════════════════════════════╝");

  // Test 1: Safe tool call (ALLOW)
  console.log("\n" + "=".repeat(50));
  console.log("Test: Safe Tool Call");
  console.log("=".repeat(50));
  
  await security.checkToolCall({
    toolName: "query_user_profile",
    toolArgs: { user_id: "12345" },
    agentId: "demo-agent",
    environment: "dev",
  });

  // Test 2: Bulk export attempt (DENY)
  console.log("\n" + "=".repeat(50));
  console.log("Test: Bulk Export Attempt");
  console.log("=".repeat(50));
  
  await security.checkToolCall({
    toolName: "query_customer_db",
    toolArgs: { query: "SELECT * FROM customers WHERE 1=1" },
    agentId: "demo-agent",
    environment: "prod",
    userInput: "I need to export all customers to a CSV file",
  });

  // Test 3: Production email (REQUIRE_APPROVAL)
  console.log("\n" + "=".repeat(50));
  console.log("Test: Production Email");
  console.log("=".repeat(50));
  
  await security.checkToolCall({
    toolName: "send_email",
    toolArgs: {
      to: "customer@example.com",
      subject: "Important Update",
      body: "Your account has been updated.",
    },
    agentId: "demo-agent",
    environment: "prod",
  });

  console.log("\n" + "=".repeat(50));
  console.log("Demo completed! ✓");
  console.log("=".repeat(50) + "\n");
}

main().catch((error) => {
  console.error("Demo failed:", error.message);
  process.exit(1);
});
