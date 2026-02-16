# Quick Start Guide

Get started with Agent-SPM in 5 minutes.

## Installation

```bash
# If you cloned the repo
npm install
npm run build

# Or install as a package (when published)
npm install @agent-security/core
```

## Basic Usage

### 1. Create Your Policy

Create `policy.json`:

```json
{
  "version": "0.1.0",
  "generated_at": "2026-01-29T00:00:00.000Z",
  "expires_at": "2027-01-29T00:00:00.000Z",
  "rules": [
    {
      "id": "DENY_DANGEROUS_OPERATIONS",
      "description": "Block potentially dangerous database operations",
      "match": { "tool_name": "query_database", "environment": "*" },
      "when": { "contains_any": ["DROP", "DELETE", "TRUNCATE"] },
      "outcome": "DENY"
    },
    {
      "id": "REQUIRE_APPROVAL_PROD_EMAIL",
      "description": "Emails in production need approval",
      "match": { "tool_name": "send_email", "environment": "prod" },
      "outcome": "REQUIRE_APPROVAL",
      "approver_role": "ops_manager"
    }
  ],
  "defaults": { "outcome": "ALLOW" }
}
```

### 2. Initialize the Platform

```typescript
import { AgentSecurity } from '@agent-security/core';

const security = new AgentSecurity({
  policyPath: './policy.json',

  onApprovalRequired: async (request, decision) => {
    console.log('Approval needed for:', request.action.tool_name);
    return await getApprovalFromManager(request);
  },

  onDeny: (request, decision) => {
    console.error('Action blocked:', decision.reasons);
  },

  onAuditEvent: (event) => {
    auditLogger.log(event);
  },
});
```

### 3. Check Before Executing Tools

```typescript
async function executeAgentTool(toolName: string, args: any) {
  const result = await security.checkToolCall({
    toolName,
    toolArgs: args,
    agentId: 'my-agent-001',
    environment: 'prod',
  });

  if (result.allowed) {
    return await actualToolExecution(toolName, args);
  } else {
    throw new Error(`Blocked: ${result.decision.reasons[0].message}`);
  }
}
```

## Add Plugins

Plugins extend the platform with runtime protections beyond static policy rules.

### Kill Switch + Rate Limiter

```typescript
import { AgentSecurity, killSwitch, rateLimiter } from '@agent-security/core';

const ks = killSwitch();

const security = new AgentSecurity({
  policyPath: './policy.json',
  plugins: [
    ks,
    rateLimiter({ maxPerMinute: 60, maxPerMinutePerTool: 20 }),
  ],
  approvalTimeoutMs: 300_000, // 5 min timeout for approvals
});

// Emergency stop
ks.kill('agent-007', 'Suspicious activity detected');
```

### Session Context

Track tool usage across a session:

```typescript
import { sessionContext } from '@agent-security/core';

const sc = sessionContext({
  limits: {
    trigger_payment: { maxPerSession: 3 },
    send_email: { maxPerSession: 10 },
  },
  sessionTtlMs: 3600_000, // 1 hour
});

const security = new AgentSecurity({
  policyPath: './policy.json',
  plugins: [sc],
});

// Session ID is pulled from request.context.session_id
const result = await security.checkToolCall({
  toolName: 'trigger_payment',
  toolArgs: { amount: 50 },
  agentId: 'agent-001',
  environment: 'prod',
  sessionId: 'session-abc', // tracked across calls
});
```

### Output Validator

Scan tool results (when using `protect()`):

```typescript
import { outputValidator } from '@agent-security/core';

const ov = outputValidator({
  sensitivePatterns: [
    /\b\d{3}-\d{2}-\d{4}\b/,    // SSN
    /\b\d{16}\b/,                 // Credit card
  ],
  forbiddenKeywords: ['password', 'secret_key'],
  maxOutputLength: 50_000,
});

const security = new AgentSecurity({
  policyPath: './policy.json',
  plugins: [ov],
});

const protectedQuery = security.protect(
  'query_database',
  async (sql: string) => db.query(sql),
  { agentId: 'data-agent', environment: 'prod', extractToolArgs: (sql) => ({ sql }) }
);

// Output automatically scanned after execution
const result = await protectedQuery('SELECT name, email FROM users');
```

## Run the Demos

### Full Demo (9 scenarios with plugins)

```bash
npm run demo
```

Demonstrates: policy decisions, kill switch, rate limiter, session limits, approval workflows, and audit trail with plugin attribution.

### Quick Demo (5 scenarios)

```bash
npm run demo:quick
```

Demonstrates: ALLOW, DENY, kill switch block, rate limit block, and REQUIRE_APPROVAL.

## Advanced Policy Rules

### Match Multiple Tools

```json
{
  "id": "APPROVE_FINANCIAL",
  "match": { "tool_name": ["trigger_payment", "trigger_refund"], "environment": "prod" },
  "outcome": "REQUIRE_APPROVAL"
}
```

### Glob Prefix Matching

```json
{
  "id": "DENY_ALL_QUERIES",
  "match": { "tool_name": "query_*", "environment": "prod" },
  "when": { "contains_any": ["SELECT *"] },
  "outcome": "DENY"
}
```

### Regex Matching

```json
{
  "id": "DENY_WILDCARD_SQL",
  "match": { "tool_name": "query_database", "environment": "*" },
  "when": { "matches_regex": "^SELECT\\s+\\*" },
  "outcome": "DENY"
}
```

### Numeric Comparisons on Tool Args

```json
{
  "id": "APPROVE_HIGH_AMOUNT",
  "match": { "tool_name": "trigger_payment", "environment": "*" },
  "when": { "tool_args_match": { "amount": { "gt": 1000 } } },
  "outcome": "REQUIRE_APPROVAL"
}
```

### Negative Matching

```json
{
  "id": "DENY_UNKNOWN_QUERIES",
  "match": { "tool_name": "query_database", "environment": "*" },
  "when": { "not_contains": ["SELECT", "COUNT"] },
  "outcome": "DENY"
}
```

### Constraints

```json
{
  "id": "LIMIT_ROWS",
  "match": { "tool_name": "query_database", "environment": "prod" },
  "outcome": "ALLOW",
  "constraints": { "max_rows": 100, "timeout_ms": 5000 }
}
```

## Async Policy Loading

Load policies from remote sources:

```typescript
const security = new AgentSecurity({
  policyLoader: async () => {
    const res = await fetch('https://policies.company.com/v1/agent-policy');
    return await res.json();
  },
});

await security.init(); // Required when using policyLoader
```

## Protect Any Function

```typescript
const protectedFunction = security.protect(
  'my_tool',
  async (arg1: string, arg2: number) => {
    return await doSomething(arg1, arg2);
  },
  {
    agentId: 'my-agent',
    environment: 'prod',
    extractToolArgs: (arg1, arg2) => ({ arg1, arg2 }),
  }
);

await protectedFunction('hello', 42);
```

## Custom Approval Workflow

```typescript
const security = new AgentSecurity({
  policyPath: './policy.json',
  approvalTimeoutMs: 300_000, // 5 min timeout

  onApprovalRequired: async (request, decision) => {
    const slackResponse = await slack.sendMessage({
      channel: '#approvals',
      text: `Approval needed for ${request.action.tool_name}`,
      buttons: ['Approve', 'Deny'],
    });

    return await slackResponse.waitForInteraction();
  },
});
```

## Access Audit Trail

```typescript
const events = security.getAuditLog();

events.forEach(event => {
  const source = event.plugin_source ? ` [${event.plugin_source}]` : '';
  console.log(`${event.timestamp}: ${event.outcome} - ${event.tool_name}${source}`);
});

security.clearAuditLog();
```

## Graceful Shutdown

```typescript
await security.shutdown();
// Calls destroy() on all plugins, cleans up resources
```

## Policy Development Tips

1. **Start Permissive** — Begin with default ALLOW and add specific DENY rules
2. **Test in Dev First** — Use environment matching to test policies safely
3. **Layer Plugins** — Combine kill switch + rate limiter + session context for defense-in-depth
4. **Monitor Audit Logs** — Use `onAuditEvent` to export to your observability stack
5. **Version Policies** — Treat policies like code and version them in Git

## Add Identity & Authorization

Enforce agent registration and trust-based access control with `@agent-security/identity`.

```bash
npm install @agent-security/identity
```

```typescript
import { AgentRegistry, ToolRegistry, TrustEvaluator, identityEnforcer } from '@agent-security/identity';

const agentRegistry = new AgentRegistry();
agentRegistry.register({
  agent_id: 'finance-bot',
  name: 'Finance Bot',
  owner: 'finance-team@acme.com',
  environment: 'prod',
  agent_type: 'workflow_agent',
  trust_level: 'privileged',
  roles: ['finance.reader', 'finance.writer'],
  capabilities: ['tool_call'],
});

const security = new AgentSecurity({
  policyPath: './policy.json',
  plugins: [
    identityEnforcer({
      agentRegistry,
      toolRegistry: new ToolRegistry(),
      trustEvaluator: new TrustEvaluator(),
      requireRegistration: true,
      minimumTrustLevel: 'basic',
    }),
  ],
});
```

## Add Egress Control & DLP

Prevent sensitive data from leaving through unauthorized channels with `@agent-security/egress`.

```bash
npm install @agent-security/egress
```

```typescript
import { egressEnforcer, DEFAULT_CLASSIFIERS } from '@agent-security/egress';

const egress = egressEnforcer({
  policy: {
    rules: [
      { id: 'BLOCK_PII_EMAIL', description: 'No PII via email', classifications: ['PII'], channels: ['email'], action: 'block' },
      { id: 'BLOCK_SECRETS', description: 'No secrets anywhere', classifications: ['SECRET'], action: 'block' },
    ],
    default_action: 'allow',
  },
  classifiers: DEFAULT_CLASSIFIERS,
  toolChannelMappings: [
    { tool_name: 'send_email', channel: 'email', destination_field: 'to' },
    { tool_name: 'http_request', channel: 'http_request', destination_field: 'url' },
  ],
});

const security = new AgentSecurity({
  policyPath: './policy.json',
  plugins: [egress],
});
```

## Add Supply Chain Security

Verify tool provenance and govern shell commands with `@agent-security/supply-chain`.

```bash
npm install @agent-security/supply-chain
```

```typescript
import { supplyChainGuard, ToolProvenance, CommandGovernor } from '@agent-security/supply-chain';

const plugin = supplyChainGuard({
  provenance: new ToolProvenance(),
  commandGovernor: new CommandGovernor({
    rules: [
      { pattern: 'npm test', action: 'allow', reason: 'Tests are safe' },
      { pattern: 'rm -rf *', action: 'block', reason: 'Destructive operations blocked' },
      { pattern: 'curl', action: 'block', reason: 'External network calls blocked' },
    ],
    default_action: 'block',
  }),
  blockUnverifiedMcp: true,
});

const security = new AgentSecurity({
  policyPath: './policy.json',
  plugins: [plugin],
});
```

## Add Guardian & Posture

Monitor for anomalies, score fleet risk, and generate compliance reports with `@agent-security/guardian` and `@agent-security/posture`.

```bash
npm install @agent-security/guardian @agent-security/posture
```

```typescript
import { GuardianAgent, BLUEPRINT_FINANCE } from '@agent-security/guardian';
import { RiskScorer, ComplianceMapper, SocFormatter } from '@agent-security/posture';

const guardian = new GuardianAgent({
  ...BLUEPRINT_FINANCE,
  auto_kill_threshold: 3,
  onAnomaly: (incident) => alertSecurityTeam(incident),
});

const socFormatter = new SocFormatter();

const security = new AgentSecurity({
  policyBundle,
  plugins: [/* your plugins */],
  onAuditEvent: (event) => {
    guardian.processEvent(event);                    // Anomaly detection
    siem.send(socFormatter.toCef(event).raw);       // SIEM export
  },
});

// Compliance reporting
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
```

## Run the Package Demos

```bash
npm run demo:identity       # Identity & authorization
npm run demo:egress         # DLP & egress control
npm run demo:supply-chain   # Tool provenance & command governance
npm run demo:guardian        # Anomaly detection & posture management
npm run demo:full-spm        # All packages integrated end-to-end
```

## Next Steps

- See [examples/](./examples/) for all integration demos and learning progression
- Read [docs/architecture.md](./docs/architecture.md) for the plugin pipeline and data flow
- Read [docs/packages.md](./docs/packages.md) for the full package API reference
- Read [docs/policies.md](./docs/policies.md) for policy authoring in depth
- Read [docs/compliance.md](./docs/compliance.md) for regulatory compliance mapping
- Review [IMPLEMENTATION.md](./IMPLEMENTATION.md) for design decisions
