/**
 * Demo 04: Guardian Agents + Posture Management
 *
 * Shows: Guardian monitors fleet → detects anomalous activity → auto-kills agent
 * → generates security incident → posture dashboard with inventory, risk scores,
 * and EU AI Act compliance.
 */

import { AgentSecurity, PolicyBundle, Event } from "@agent-security/core";
import { GuardianAgent, BLUEPRINT_FINANCE, SecurityIncident } from "@agent-security/guardian";
import {
  PostureInventory,
  RiskScorer,
  ComplianceMapper,
  SocFormatter,
  AuditExporter,
} from "@agent-security/posture";

async function main() {
  console.log("=== Guardian Agents + Posture Management Demo ===\n");

  // --- Set up guardian with finance blueprint ---
  const guardian = new GuardianAgent({
    ...BLUEPRINT_FINANCE,
    auto_kill_threshold: 3,
    onAnomaly: (incident) => {
      console.log(`  [GUARDIAN ${incident.severity.toUpperCase()}] ${incident.description}`);
      console.log(`    Action: ${incident.action_taken}`);
    },
    onKill: (agentId, reason) => {
      console.log(`  [GUARDIAN KILL] Agent "${agentId}" terminated: ${reason}`);
    },
  });

  // --- Set up posture inventory ---
  const inventory = new PostureInventory();

  inventory.registerAgent({
    agent_id: "finance-bot",
    name: "Finance Bot",
    owner: "finance@company.com",
    environment: "prod",
    trust_level: "privileged",
    agent_type: "workflow_agent",
    roles: ["finance.writer"],
    capabilities: ["tool_call"],
  });

  inventory.registerAgent({
    agent_id: "rogue-bot",
    name: "Rogue Bot",
    owner: "unknown@company.com",
    environment: "prod",
    trust_level: "basic",
    agent_type: "autonomous_agent",
    capabilities: ["tool_call", "code_execute", "web_browse"],
  });

  inventory.registerTool({
    tool_name: "query_customer_db",
    version: "2.0",
    provider: "built-in",
    verified: true,
    permissions_required: ["db.read"],
  });

  inventory.registerTool({
    tool_name: "trigger_payment",
    version: "1.0",
    provider: "built-in",
    verified: true,
    permissions_required: ["finance.write"],
  });

  inventory.registerTool({
    tool_name: "send_email",
    version: "1.0",
    provider: "built-in",
    verified: true,
    permissions_required: ["email.send"],
  });

  inventory.registerPlugin({ name: "kill-switch", version: "0.1.0" });
  inventory.registerPlugin({ name: "rate-limiter", version: "0.1.0" });
  inventory.registerPlugin({ name: "identity-enforcer", version: "0.1.0" });

  console.log("--- Inventory Summary ---");
  console.log(`  ${JSON.stringify(inventory.getSummary())}\n`);

  // --- Set up platform ---
  const policyBundle: PolicyBundle = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    rules: [
      { id: "ALLOW_ALL", description: "Allow all (guardian handles enforcement)", match: { tool_name: "*", environment: "*" }, outcome: "ALLOW" },
    ],
    defaults: { outcome: "ALLOW" },
  };

  const security = new AgentSecurity({
    policyBundle,
    onAuditEvent: (event: Event) => {
      // Feed all events to the guardian
      guardian.processEvent(event);
    },
  });

  // --- Simulate normal activity ---
  console.log("--- Normal Activity ---");
  await security.checkToolCall({
    toolName: "query_customer_db",
    toolArgs: { query: "SELECT name FROM customers LIMIT 10" },
    agentId: "finance-bot",
    environment: "prod",
  });
  console.log("  finance-bot: normal DB query\n");

  // --- Simulate anomalous activity (rapid-fire from rogue-bot) ---
  console.log("--- Anomalous Activity: Rapid DB queries from rogue-bot ---");
  for (let i = 0; i < 5; i++) {
    await security.checkToolCall({
      toolName: "query_customer_db",
      toolArgs: { query: `SELECT * FROM customers OFFSET ${i * 1000} LIMIT 1000` },
      agentId: "rogue-bot",
      environment: "prod",
    });
  }

  // Check guardian state
  console.log(`\n  rogue-bot killed: ${guardian.isKilled("rogue-bot")}`);
  console.log(`  Total incidents: ${guardian.getIncidents().length}\n`);

  // --- Risk scoring ---
  console.log("--- Risk Scores ---");
  const scorer = new RiskScorer();
  const fleetScore = scorer.scoreFleet(inventory.getAll());

  console.log(`  Fleet overall: ${fleetScore.overall_score}/100 (${fleetScore.level})`);
  for (const score of fleetScore.agent_scores) {
    console.log(`  ${score.item_id}: ${score.score}/100 (${score.level})`);
    for (const f of score.factors) {
      console.log(`    - ${f.description} (+${f.impact})`);
    }
  }

  if (fleetScore.top_risks.length > 0) {
    console.log("\n  Top Risks:");
    for (const risk of fleetScore.top_risks) {
      console.log(`    ${risk.item_id}: ${risk.score} — ${risk.description}`);
    }
  }

  // --- Compliance mapping ---
  console.log("\n--- EU AI Act Compliance ---");
  const complianceMapper = new ComplianceMapper();
  const compliance = complianceMapper.generateReport("eu_ai_act", {
    hasInventory: true,
    hasAuditLog: true,
    hasRiskScoring: true,
    hasDlp: false,
    hasHumanOversight: true,
    hasSupplyChainVerification: false,
    hasGuardian: true,
    hasIdentityManagement: true,
  });

  console.log(`  Score: ${compliance.summary.compliance_score}%`);
  console.log(`  Met: ${compliance.summary.met}/${compliance.summary.total}`);
  console.log(`  Partial: ${compliance.summary.partial}/${compliance.summary.total}`);
  console.log(`  Not Met: ${compliance.summary.not_met}/${compliance.summary.total}`);

  for (const control of compliance.controls) {
    const icon = control.status === "met" ? "[+]" : control.status === "partial" ? "[~]" : "[-]";
    console.log(`  ${icon} ${control.control_id}: ${control.title} (${control.status})`);
  }

  // --- SOC integration ---
  console.log("\n--- SOC Event Format (CEF) ---");
  const socFormatter = new SocFormatter();
  const auditLog = security.getAuditLog();
  if (auditLog.length > 0) {
    const cef = socFormatter.toCef(auditLog[0]);
    console.log(`  ${cef.raw.substring(0, 120)}...`);
  }

  // --- Audit export ---
  console.log("\n--- Audit Timeline ---");
  const timeline = socFormatter.createTimeline(auditLog);
  for (const entry of timeline.slice(0, 5)) {
    console.log(`  ${entry.timestamp} | ${entry.agent_id} → ${entry.action} [${entry.outcome}]`);
  }
  if (timeline.length > 5) {
    console.log(`  ... and ${timeline.length - 5} more events`);
  }

  // --- Incident summary ---
  console.log("\n--- Security Incidents ---");
  for (const incident of guardian.getIncidents()) {
    console.log(`  [${incident.severity.toUpperCase()}] ${incident.type}: ${incident.description}`);
  }

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);
