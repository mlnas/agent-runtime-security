#!/usr/bin/env ts-node

import {
  AgentSecurity,
  killSwitch,
  rateLimiter,
  sessionContext,
} from "./core/src";
import type { KillSwitchPlugin } from "./core/src/plugins/kill-switch";
import type { RateLimiterPlugin } from "./core/src/plugins/rate-limiter";
import type { SessionContextPlugin } from "./core/src/plugins/session-context";
import { AgentActionRequest, Decision } from "./core/src/schemas";

/**
 * Agent Runtime Security Platform — Full Demo
 *
 * Showcases:
 *   1. Plugin architecture (kill switch, rate limiter, session context)
 *   2. Policy evaluation (ALLOW / DENY / REQUIRE_APPROVAL)
 *   3. Approval workflow with timeouts
 *   4. Audit trail
 *   5. protect() wrapper
 */

// Track approval requests for simulation
const pendingApprovals: Array<{
  request: AgentActionRequest;
  decision: Decision;
  resolve: (approved: boolean) => void;
}> = [];

// ----- Initialize plugins -----

const ks = killSwitch();
const rl = rateLimiter({ maxPerMinute: 5, maxPerMinutePerTool: 3 });
const sc = sessionContext({
  limits: { trigger_payment: { maxPerSession: 2 } },
  sessionTtlMs: 600_000,
});

// ----- Initialize Platform -----

const security = new AgentSecurity({
  policyPath: "./default-policy.json",
  defaultEnvironment: "dev",
  defaultOwner: "demo@example.com",
  approvalTimeoutMs: 10_000, // 10 seconds

  plugins: [ks, rl, sc],

  onApprovalRequired: async (request, decision) => {
    console.log("\n  ⏳ APPROVAL REQUIRED");
    console.log(`     Tool: ${request.action.tool_name}`);
    console.log(`     Agent: ${request.agent.agent_id} (${request.agent.environment})`);
    console.log(`     Approver: ${decision.approver_role || "any"}`);
    return new Promise<boolean>((resolve) => {
      pendingApprovals.push({ request, decision, resolve });
    });
  },

  onDeny: (request, decision) => {
    console.log("\n  ❌ DENIED");
    console.log(`     Tool: ${request.action.tool_name}`);
    console.log(`     Reason: ${decision.reasons[0]?.message}`);
  },

  onAllow: (request, decision) => {
    console.log("\n  ✅ ALLOWED");
    console.log(`     Tool: ${request.action.tool_name}`);
    console.log(`     Reason: ${decision.reasons[0]?.message}`);
  },

  onAuditEvent: (event) => {
    const src = event.plugin_source ? ` [${event.plugin_source}]` : "";
    console.log(`  📝 Event: ${event.outcome}${src}`);
  },
});

// ----- Helpers -----

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function header(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

// ----- Demo scenarios -----

async function runDemo() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     Agent Runtime Security Platform v0.2 — Full Demo       ║
║     Plugin Architecture + Policy Engine                    ║
╚════════════════════════════════════════════════════════════╝
`);

  // ---- 1. ALLOW - Safe dev action ----
  header("1. Safe Dev Action (ALLOW)");
  await security.checkToolCall({
    toolName: "query_database",
    toolArgs: { query: "SELECT name FROM users LIMIT 10" },
    agentId: "agent-001",
    environment: "dev",
  });

  await sleep(300);

  // ---- 2. DENY - Bulk export blocked by policy ----
  header("2. Bulk Export (DENY — policy rule)");
  await security.checkToolCall({
    toolName: "query_customer_db",
    toolArgs: { query: "SELECT * FROM customers" },
    agentId: "agent-002",
    environment: "prod",
    userInput: "Export all customers to CSV",
  });

  await sleep(300);

  // ---- 3. DENY - PCI data email ----
  header("3. PCI Data Email (DENY — data label match)");
  await security.checkToolCall({
    toolName: "send_email",
    toolArgs: { to: "external@co.com", subject: "CC details" },
    agentId: "agent-003",
    environment: "prod",
    dataLabels: ["PCI"],
  });

  await sleep(300);

  // ---- 4. KILL SWITCH ----
  header("4. Kill Switch (emergency agent disable)");
  console.log("\n  Killing agent-rogue...");
  ks.kill("agent-rogue", "Suspicious bulk export pattern detected");
  console.log(`  Is killed? ${ks.isKilled("agent-rogue")}`);

  const ksResult = await security.checkToolCall({
    toolName: "query_database",
    toolArgs: { query: "SELECT 1" },
    agentId: "agent-rogue",
    environment: "dev",
  });
  console.log(`  Allowed: ${ksResult.allowed}`);

  console.log("\n  Reviving agent-rogue...");
  ks.revive("agent-rogue");
  console.log(`  Is killed? ${ks.isKilled("agent-rogue")}`);

  await sleep(300);

  // ---- 5. RATE LIMITER ----
  header("5. Rate Limiter (max 3/min per tool)");
  for (let i = 1; i <= 4; i++) {
    const result = await security.checkToolCall({
      toolName: "query_database",
      toolArgs: { query: `SELECT ${i}` },
      agentId: "agent-fast",
      environment: "dev",
    });
    console.log(`  Call ${i}: ${result.allowed ? "✅ allowed" : "❌ rate-limited"}`);
  }
  rl.resetAgent("agent-fast");

  await sleep(300);

  // ---- 6. SESSION CONTEXT ----
  header("6. Session Context (max 2 payments per session)");
  for (let i = 1; i <= 3; i++) {
    const result = await security.checkToolCall({
      toolName: "trigger_payment",
      toolArgs: { amount: 100 * i, currency: "USD" },
      agentId: "agent-pay",
      environment: "dev",
      sessionId: "session-abc",
    });
    console.log(`  Payment ${i}: ${result.allowed ? "✅ allowed" : "❌ session limit"}`);
  }

  await sleep(300);

  // ---- 7. REQUIRE_APPROVAL with approval ----
  header("7. Payment Approval (approve)");
  const approvalPromise = security.checkToolCall({
    toolName: "trigger_payment",
    toolArgs: { amount: 5000, currency: "USD", recipient: "vendor@co.com" },
    agentId: "agent-finance",
    environment: "prod",
  });
  await sleep(200);
  if (pendingApprovals.length > 0) {
    console.log("\n  Manager approving...");
    pendingApprovals[pendingApprovals.length - 1].resolve(true);
  }
  const approved = await approvalPromise;
  console.log(`  Allowed: ${approved.allowed}`);

  await sleep(300);

  // ---- 8. REQUIRE_APPROVAL with rejection ----
  header("8. Email Rejection (reject)");
  const rejectPromise = security.checkToolCall({
    toolName: "send_email",
    toolArgs: { to: "all@company.com", subject: "Announcement" },
    agentId: "agent-email",
    environment: "prod",
  });
  await sleep(200);
  if (pendingApprovals.length > 0) {
    console.log("\n  Manager rejecting...");
    pendingApprovals[pendingApprovals.length - 1].resolve(false);
  }
  const rejected = await rejectPromise;
  console.log(`  Allowed: ${rejected.allowed}`);

  await sleep(300);

  // ---- 9. protect() wrapper ----
  header("9. protect() Wrapper");

  const mockSendEmail = async (to: string, subject: string, body: string) => {
    return { success: true, messageId: "mock-123" };
  };

  const safeSendEmail = security.protect("send_email", mockSendEmail, {
    agentId: "wrapper-agent",
    environment: "dev",
    extractToolArgs: (to, subject, body) => ({ to, subject, body }),
  });

  try {
    const emailResult = await safeSendEmail("user@example.com", "Test", "Hello");
    console.log("  ✅ Email sent:", emailResult);
  } catch (err: any) {
    console.log("  ❌ Blocked:", err.message);
  }

  await sleep(300);

  // ---- Audit trail ----
  header("Audit Log Summary");
  const log = security.getAuditLog();
  console.log(`\n  Total events: ${log.length}`);

  const outcomes: Record<string, number> = {};
  for (const e of log) {
    outcomes[e.outcome] = (outcomes[e.outcome] || 0) + 1;
  }
  console.log("\n  By outcome:");
  for (const [o, c] of Object.entries(outcomes)) {
    console.log(`    ${o}: ${c}`);
  }

  const pluginEvents = log.filter((e) => e.plugin_source);
  if (pluginEvents.length > 0) {
    console.log("\n  Plugin-generated events:");
    for (const e of pluginEvents) {
      console.log(`    [${e.plugin_source}] ${e.outcome}: ${e.tool_name} (${e.agent_id})`);
    }
  }

  // ---- Done ----
  console.log("\n" + "=".repeat(60));
  console.log("  Demo completed! ✅");
  console.log("=".repeat(60));
  console.log("\n  Features demonstrated:");
  console.log("    • Plugin pipeline (kill switch, rate limiter, session context)");
  console.log("    • Policy evaluation (ALLOW / DENY / REQUIRE_APPROVAL)");
  console.log("    • Approval workflow with timeout support");
  console.log("    • Custom environments and action types");
  console.log("    • Regex, numeric, and list-based rule matching");
  console.log("    • Full audit trail with plugin attribution");
  console.log("    • protect() function wrapper");
  console.log("    • Zero infrastructure — everything runs in-process\n");

  await security.shutdown();
}

runDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
