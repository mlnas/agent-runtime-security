# Agent Runtime Security SDK

**Open-source SDK for adding runtime security policies to AI agents.**

Protect your AI agents with declarative security policies and a plugin architecture that runs directly in your code. No gateway, no infrastructure — just `npm install` and integrate.

## Why This SDK?

AI agents can access sensitive data, make API calls, and execute actions on your behalf. Without runtime security, a prompt injection or rogue agent could:

- Export your entire customer database
- Send PII/PCI data to external systems
- Execute unauthorized financial transactions
- Delete production data

This SDK lets you define **security policies as code** and enforce them at runtime, right where your agent executes.

## Key Features

- **Zero Infrastructure** — Runs in-process, no gateway or server needed
- **Plugin Architecture** — Extensible lifecycle hooks (beforeCheck, afterDecision, afterExecution)
- **Policy as Code** — Define rules in JSON, version control with Git
- **Three Decision Types** — ALLOW, DENY, or REQUIRE_APPROVAL
- **Built-in Plugins** — Kill switch, rate limiter, session context, output validator
- **Approval Timeouts** — Configurable timeout so approvals can't hang forever
- **Custom Environments** — Any string (dev, staging, prod, sandbox, preview, etc.)
- **Advanced Rule Matching** — Regex, numeric comparisons, array matching, glob prefixes
- **Async Policy Loading** — Load policies from files, URLs, vaults, or custom sources
- **Full Audit Trail** — Every decision is logged with plugin attribution
- **Framework Agnostic** — Works with LangChain, CrewAI, custom agents, etc.
- **TypeScript Native** — Full type safety and IDE autocomplete

## Quick Start

### 1. Install

```bash
npm install @agent-security/core
```

### 2. Create a Policy

Create `policy.json`:

```json
{
  "version": "0.1.0",
  "generated_at": "2026-01-29T00:00:00.000Z",
  "expires_at": "2027-01-29T00:00:00.000Z",
  "rules": [
    {
      "id": "DENY_BULK_EXPORT",
      "description": "Block bulk data exports",
      "match": { "tool_name": "query_database", "environment": "*" },
      "when": { "contains_any": ["SELECT *", "export", "dump"] },
      "outcome": "DENY"
    },
    {
      "id": "REQUIRE_APPROVAL_PAYMENT",
      "description": "Payments need approval in production",
      "match": { "tool_name": "trigger_payment", "environment": "prod" },
      "outcome": "REQUIRE_APPROVAL",
      "approver_role": "finance_manager"
    }
  ],
  "defaults": { "outcome": "ALLOW" }
}
```

### 3. Integrate with Your Agent

```typescript
import { AgentSecurity, killSwitch, rateLimiter } from '@agent-security/core';

const ks = killSwitch();

const security = new AgentSecurity({
  policyPath: './policy.json',
  plugins: [ks, rateLimiter({ maxPerMinute: 60 })],
  approvalTimeoutMs: 300_000, // 5 minute timeout

  onApprovalRequired: async (request, decision) => {
    return await askManager(request); // Slack, email, etc.
  },
  onDeny: (request, decision) => {
    logger.error('Action blocked', { request, decision });
  },
});

// Before executing any tool, check the policy
const result = await security.checkToolCall({
  toolName: 'send_email',
  toolArgs: { to: 'user@example.com' },
  agentId: 'my-agent',
  environment: 'prod',
});

if (result.allowed) {
  await sendEmail();
}

// Emergency: disable a rogue agent instantly
ks.kill('rogue-agent-001', 'Suspicious bulk export pattern');
```

### 4. Or Use the Protect Wrapper

```typescript
const sendEmail = security.protect(
  'send_email',
  async (to: string, subject: string, body: string) => {
    return await emailService.send({ to, subject, body });
  },
  {
    agentId: 'email-agent',
    environment: 'prod',
    extractToolArgs: (to, subject, body) => ({ to, subject, body }),
  }
);

// Automatically checked before execution
await sendEmail('user@example.com', 'Hello', 'World');
```

## Plugin Architecture

The SDK uses a phased plugin pipeline inspired by middleware patterns:

```
Phase 1: beforeCheck    → Kill switch, rate limiting, session checks
Phase 2: evaluate       → Core policy engine (rule matching)
Phase 3: afterDecision  → Modify decisions, apply overrides
Phase 4: callbacks      → onAllow / onDeny / onApprovalRequired
Phase 5: afterExecution → Output validation (protect() only)
```

### Built-in Plugins

**Kill Switch** — Emergency agent disable:
```typescript
const ks = killSwitch();
ks.kill('agent-id');    // Disable immediately
ks.revive('agent-id');  // Re-enable
ks.killAll();           // Nuclear option
```

**Rate Limiter** — Per-agent, per-tool rate limits:
```typescript
rateLimiter({ maxPerMinute: 60, maxPerMinutePerTool: 20 })
```

**Session Context** — Track state across calls:
```typescript
sessionContext({
  limits: { trigger_payment: { maxPerSession: 3 } },
  sessionTtlMs: 3600_000,
})
```

**Output Validator** — Scan tool results for sensitive data:
```typescript
outputValidator({
  sensitivePatterns: [/\b\d{3}-\d{2}-\d{4}\b/], // SSN
  onSensitiveData: (tool, matches) => alert(tool, matches),
})
```

### Custom Plugins

```typescript
const myPlugin: SecurityPlugin = {
  name: 'my-plugin',
  async beforeCheck(ctx) {
    // Return { decision } to short-circuit, or void to continue
  },
  async afterDecision(ctx) {
    // Modify or override the decision
  },
  async afterExecution(ctx) {
    // Validate output, enrich audit, etc.
  },
};
```

## Advanced Policy Rules

**Match multiple tools:**
```json
{ "match": { "tool_name": ["trigger_payment", "trigger_refund"], "environment": "prod" } }
```

**Glob prefix matching:**
```json
{ "match": { "tool_name": "query_*", "environment": "*" } }
```

**Regex matching:**
```json
{ "when": { "matches_regex": "^SELECT\\s+\\*" } }
```

**Numeric comparisons on tool args:**
```json
{ "when": { "tool_args_match": { "amount": { "gt": 1000 } } } }
```

**Negative matching:**
```json
{ "when": { "not_contains": ["safe_operation", "internal_only"] } }
```

## Run the Demo

```bash
git clone https://github.com/mlnas/agent-runtime-security
cd agent-runtime-security

npm run install:all
npm run demo          # Full demo (9 scenarios)
npm run demo:quick    # Quick demo (5 scenarios)
```

The demo shows: policy decisions, kill switch, rate limiter, session limits, approval workflows, and audit trail with plugin attribution.

## API Reference

### AgentSecurity Constructor

| Option | Type | Description |
|---|---|---|
| `policyPath` | `string` | Path to policy JSON file |
| `policyJson` | `string` | Policy as JSON string |
| `policyBundle` | `PolicyBundle` | Policy object |
| `policyLoader` | `() => Promise<PolicyBundle>` | Async loader (call `init()` after) |
| `plugins` | `SecurityPlugin[]` | Array of plugins |
| `approvalTimeoutMs` | `number` | Timeout for approval callbacks |
| `onApprovalRequired` | `(req, dec) => Promise<boolean>` | Approval callback |
| `onDeny` | `(req, dec) => void` | Denial callback |
| `onAllow` | `(req, dec) => void` | Allow callback |
| `onAuditEvent` | `(event) => void` | Audit callback |
| `onError` | `(error, ctx) => void` | Error callback |
| `defaultEnvironment` | `string` | Default environment |
| `defaultOwner` | `string` | Default agent owner |

### Methods

| Method | Description |
|---|---|
| `checkToolCall(params)` | Check if a tool call is allowed |
| `protect(toolName, fn, opts)` | Wrap a function with security |
| `init()` | Async init (for policyLoader) |
| `registerPlugin(plugin)` | Add a plugin at runtime |
| `unregisterPlugin(name)` | Remove a plugin |
| `getPlugin(name)` | Get a registered plugin |
| `getAuditLog()` | Get all audit events |
| `clearAuditLog()` | Clear audit history |
| `getPolicyBundle()` | Get current policy |
| `reloadPolicy()` | Reload from file/JSON |
| `reloadPolicyAsync(loader?)` | Reload from async source |
| `shutdown()` | Gracefully shut down SDK + plugins |

## Documentation

- [Quick Start Guide](./QUICKSTART.md)
- [Architecture](./docs/architecture.md)
- [Schema Specification](./docs/schemas.md)
- [Policy Guide](./docs/policies.md)
- [Examples](./examples/)

## Contributing

We welcome contributions! This is an open-source project designed for the community.

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Built for enterprises integrating AI agents into production systems.**
