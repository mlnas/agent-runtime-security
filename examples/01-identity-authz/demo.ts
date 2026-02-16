/**
 * Demo 01: Agent Identity + Authorization
 *
 * Shows: register agents with typed identities, register tools with manifests,
 * policies enforce trust-level and role-based access control.
 */

import { AgentSecurity, createDefaultPolicyBundle, PolicyBundle } from "@agent-security/core";
import { AgentRegistry, ToolRegistry, TrustEvaluator, identityEnforcer } from "@agent-security/identity";

async function main() {
  console.log("=== Agent Identity + Authorization Demo ===\n");

  // --- Set up registries ---
  const agentRegistry = new AgentRegistry();
  const toolRegistry = new ToolRegistry();
  const trustEvaluator = new TrustEvaluator();

  // Register agents with different trust levels
  agentRegistry.register({
    agent_id: "finance-bot",
    name: "Finance Bot",
    owner: "finance-team@company.com",
    environment: "prod",
    agent_type: "workflow_agent",
    trust_level: "privileged",
    roles: ["finance.reader", "finance.writer"],
    capabilities: ["tool_call"],
    max_delegation_depth: 1,
  });

  agentRegistry.register({
    agent_id: "intern-bot",
    name: "Intern Bot",
    owner: "intern@company.com",
    environment: "prod",
    agent_type: "chat_agent",
    trust_level: "basic",
    roles: ["finance.reader"],
    capabilities: ["tool_call"],
  });

  agentRegistry.register({
    agent_id: "auto-bot",
    name: "Autonomous Bot",
    owner: "ops@company.com",
    environment: "prod",
    agent_type: "autonomous_agent",
    trust_level: "verified",
    roles: ["db.writer"],
    capabilities: ["tool_call", "code_execute"],
  });

  // Register tools
  toolRegistry.register({
    tool_name: "trigger_payment",
    version: "1.0.0",
    provider: "built-in",
    permissions_required: ["finance.write"],
    verified: true,
  });

  toolRegistry.register({
    tool_name: "query_customer_db",
    version: "2.1.0",
    provider: "built-in",
    permissions_required: ["db.read"],
    verified: true,
  });

  toolRegistry.register({
    tool_name: "write_db",
    version: "1.0.0",
    provider: "built-in",
    permissions_required: ["db.write"],
    verified: true,
  });

  console.log(`Registered ${agentRegistry.size} agents, ${toolRegistry.size} tools\n`);

  // --- Create policy bundle with identity-aware rules ---
  const policyBundle: PolicyBundle = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    rules: [
      {
        id: "PRIVILEGED_PAYMENT",
        description: "Only privileged agents can trigger payments in prod",
        match: {
          tool_name: "trigger_payment",
          environment: "prod",
          trust_level_min: "privileged",
        },
        outcome: "ALLOW",
      },
      {
        id: "DENY_PAYMENT_LOW_TRUST",
        description: "Deny payment for non-privileged agents",
        match: {
          tool_name: "trigger_payment",
          environment: "prod",
        },
        outcome: "DENY",
      },
      {
        id: "AUTONOMOUS_DB_WRITE_TICKET",
        description: "Autonomous agents require a ticket for DB writes",
        match: {
          tool_name: "write_db",
          environment: "prod",
          agent_type: "autonomous_agent",
        },
        outcome: "REQUIRE_TICKET",
      },
      {
        id: "ALLOW_DB_READ",
        description: "Allow DB reads for agents with finance.reader role",
        match: {
          tool_name: "query_customer_db",
          environment: "*",
          agent_roles_any: ["finance.reader", "db.reader"],
        },
        outcome: "ALLOW",
      },
      {
        id: "DEFAULT_ALLOW",
        description: "Default allow for registered agents",
        match: { tool_name: "*", environment: "*" },
        outcome: "ALLOW",
      },
    ],
    defaults: { outcome: "DENY" },
  };

  // --- Set up platform with identity enforcer ---
  const security = new AgentSecurity({
    policyBundle,
    plugins: [
      identityEnforcer({
        agentRegistry,
        toolRegistry,
        trustEvaluator,
        requireRegistration: true,
        minimumTrustLevel: "basic",
      }),
    ],
    onTicketRequired: async (req, decision) => {
      console.log(`  [Ticket Check] Agent "${req.agent.agent_id}" needs a ticket for ${req.action.tool_name}`);
      // Simulate: return a ticket ID to approve
      return "JIRA-1234";
    },
    onDeny: (req, decision) => {
      console.log(`  [DENIED] ${req.agent.agent_id} → ${req.action.tool_name}: ${decision.reasons.map(r => r.message).join("; ")}`);
    },
    onAllow: (req, decision) => {
      console.log(`  [ALLOWED] ${req.agent.agent_id} → ${req.action.tool_name}`);
    },
  });

  // --- Scenario 1: Privileged agent triggers payment ---
  console.log("--- Scenario 1: Privileged agent triggers payment ---");
  const r1 = await security.checkToolCall({
    toolName: "trigger_payment",
    toolArgs: { amount: 500, currency: "USD" },
    agentId: "finance-bot",
    environment: "prod",
  });
  console.log(`  Result: ${r1.allowed ? "ALLOWED" : "DENIED"}\n`);

  // --- Scenario 2: Basic-trust agent tries to trigger payment ---
  console.log("--- Scenario 2: Basic-trust agent tries payment ---");
  const r2 = await security.checkToolCall({
    toolName: "trigger_payment",
    toolArgs: { amount: 100, currency: "USD" },
    agentId: "intern-bot",
    environment: "prod",
  });
  console.log(`  Result: ${r2.allowed ? "ALLOWED" : "DENIED"}\n`);

  // --- Scenario 3: Autonomous agent writes to DB (needs ticket) ---
  console.log("--- Scenario 3: Autonomous agent writes to DB (needs ticket) ---");
  const r3 = await security.checkToolCall({
    toolName: "write_db",
    toolArgs: { table: "users", operation: "UPDATE" },
    agentId: "auto-bot",
    environment: "prod",
  });
  console.log(`  Result: ${r3.allowed ? "ALLOWED" : "DENIED"}\n`);

  // --- Scenario 4: Unregistered agent tries action ---
  console.log("--- Scenario 4: Unregistered agent tries action ---");
  const r4 = await security.checkToolCall({
    toolName: "query_customer_db",
    toolArgs: { query: "SELECT name FROM customers" },
    agentId: "unknown-agent",
    environment: "prod",
  });
  console.log(`  Result: ${r4.allowed ? "ALLOWED" : "DENIED"}\n`);

  // --- Scenario 5: Role-based access to customer DB ---
  console.log("--- Scenario 5: Role-based DB read (finance.reader role) ---");
  const r5 = await security.checkToolCall({
    toolName: "query_customer_db",
    toolArgs: { query: "SELECT name FROM customers LIMIT 10" },
    agentId: "intern-bot",
    environment: "prod",
  });
  console.log(`  Result: ${r5.allowed ? "ALLOWED" : "DENIED"}\n`);

  // --- Show trust evaluation ---
  console.log("--- Trust Evaluation ---");
  const agents = agentRegistry.list();
  for (const agent of agents) {
    const result = trustEvaluator.evaluate(agent, { environment: "prod" });
    console.log(`  ${agent.name}: base=${result.base_trust}, effective=${result.effective_trust}, score=${result.score}`);
    if (result.adjustments.length > 0) {
      for (const adj of result.adjustments) {
        console.log(`    ${adj.reason}: ${adj.delta > 0 ? "+" : ""}${adj.delta}`);
      }
    }
  }

  // --- Audit log summary ---
  console.log(`\n--- Audit Log: ${security.getAuditLog().length} events ---`);
  for (const event of security.getAuditLog()) {
    console.log(`  ${event.outcome}: ${event.agent_id} → ${event.tool_name} (${event.reasons.map(r => r.code).join(", ")})`);
  }

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);
