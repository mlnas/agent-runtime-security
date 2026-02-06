#!/usr/bin/env ts-node

import { AgentSecurity, killSwitch, rateLimiter } from "./core/src";

/**
 * Quick 5-scenario demo showing core features + plugins.
 */

const ks = killSwitch();
const rl = rateLimiter({ maxPerMinute: 3 });

const security = new AgentSecurity({
  policyPath: "./default-policy.json",

  plugins: [ks, rl],

  onApprovalRequired: async (request, decision) => {
    console.log("  ⏳ APPROVAL REQUIRED");
    console.log(`     Reason: ${decision.reasons[0]?.message}`);
    return false; // auto-reject for quick demo
  },

  onDeny: (_, decision) => {
    console.log("  ✗ DENIED");
    console.log(`     Reason: ${decision.reasons[0]?.message}`);
  },

  onAllow: (_, decision) => {
    console.log("  ✓ ALLOWED");
    console.log(`     Reason: ${decision.reasons[0]?.message}`);
  },
});

async function main() {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   Agent Runtime Security SDK — Quick Demo     ║");
  console.log("╚════════════════════════════════════════════════╝");

  // 1. ALLOW
  console.log("\n" + "=".repeat(50));
  console.log("  1. Safe Tool Call (dev)");
  console.log("=".repeat(50));
  await security.checkToolCall({
    toolName: "query_user_profile",
    toolArgs: { user_id: "12345" },
    agentId: "demo-agent",
    environment: "dev",
  });

  // 2. DENY — policy
  console.log("\n" + "=".repeat(50));
  console.log("  2. Bulk Export (policy DENY)");
  console.log("=".repeat(50));
  await security.checkToolCall({
    toolName: "query_customer_db",
    toolArgs: { query: "SELECT * FROM customers" },
    agentId: "demo-agent",
    environment: "prod",
    userInput: "export all customers to a CSV file",
  });

  // 3. REQUIRE_APPROVAL
  console.log("\n" + "=".repeat(50));
  console.log("  3. Production Email (approval required)");
  console.log("=".repeat(50));
  await security.checkToolCall({
    toolName: "send_email",
    toolArgs: { to: "customer@example.com", subject: "Update" },
    agentId: "demo-agent",
    environment: "prod",
  });

  // 4. KILL SWITCH
  console.log("\n" + "=".repeat(50));
  console.log("  4. Kill Switch (emergency stop)");
  console.log("=".repeat(50));
  ks.kill("rogue-bot", "Suspicious behaviour");
  const ksResult = await security.checkToolCall({
    toolName: "read_data",
    toolArgs: {},
    agentId: "rogue-bot",
    environment: "dev",
  });
  console.log(`  Killed agent allowed? ${ksResult.allowed}`);
  ks.revive("rogue-bot");

  // 5. RATE LIMIT
  console.log("\n" + "=".repeat(50));
  console.log("  5. Rate Limiter (max 3/min)");
  console.log("=".repeat(50));
  for (let i = 1; i <= 4; i++) {
    const r = await security.checkToolCall({
      toolName: "fast_tool",
      toolArgs: { i },
      agentId: "speedy-agent",
      environment: "dev",
    });
    console.log(`  Call ${i}: ${r.allowed ? "✓ ok" : "✗ rate-limited"}`);
  }

  console.log("\n" + "=".repeat(50));
  console.log("  Demo completed! ✓");
  console.log("=".repeat(50) + "\n");

  await security.shutdown();
}

main().catch((err) => {
  console.error("Demo failed:", err.message);
  process.exit(1);
});
