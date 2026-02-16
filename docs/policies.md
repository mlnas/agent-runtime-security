# Policy Authoring Guide

Declarative security policies for controlling AI agent tool execution at runtime.

---

## Fundamentals

Agent-SPM uses a **first-match rule engine** modeled on firewall ACLs. Rules are evaluated in order — the first rule whose `match` and `when` conditions are satisfied determines the outcome. If no rule matches, the bundle's `defaults.outcome` applies.

Key properties:
- **Rule ordering matters.** More specific rules go first, catch-all rules go last.
- **All `when` conditions use AND logic.** Every condition in a rule's `when` block must be true.
- **Policies expire.** Every bundle has an `expires_at` timestamp. Expired bundles are rejected at load time.
- **Policies can be signed.** HMAC-SHA256 signatures prevent tampering. See [SECURITY.md](../SECURITY.md#policy-integrity).

---

## Policy Bundle Structure

A complete, annotated policy bundle:

```json
{
  "version": "1.0.0",
  "generated_at": "2026-01-15T00:00:00.000Z",
  "expires_at": "2027-01-15T00:00:00.000Z",

  "rules": [
    {
      "id": "BLOCK_BULK_EXPORT",
      "description": "Prevent mass data exfiltration via database tools",
      "match": {
        "tool_name": "query_*",
        "environment": "prod"
      },
      "when": {
        "contains_any": ["SELECT *", "export", "dump", "LIMIT 10000"]
      },
      "outcome": "DENY"
    },
    {
      "id": "PRIVILEGED_PAYMENTS_ONLY",
      "description": "Only privileged agents can trigger payments",
      "match": {
        "tool_name": "trigger_payment",
        "environment": "prod",
        "trust_level_min": "privileged"
      },
      "outcome": "ALLOW"
    },
    {
      "id": "DENY_PAYMENT_OTHERS",
      "description": "Deny payments for non-privileged agents",
      "match": {
        "tool_name": "trigger_payment",
        "environment": "*"
      },
      "outcome": "DENY"
    },
    {
      "id": "DEPLOY_REQUIRES_HUMAN",
      "description": "Production deployments require human-in-the-loop",
      "match": {
        "tool_name": "deploy_service",
        "environment": "prod"
      },
      "outcome": "REQUIRE_HUMAN"
    },
    {
      "id": "HIGH_VALUE_APPROVAL",
      "description": "Transactions over $1000 require manager approval",
      "match": {
        "tool_name": "trigger_payment",
        "environment": "*"
      },
      "when": {
        "tool_args_match": { "amount": { "gt": 1000 } }
      },
      "outcome": "REQUIRE_APPROVAL",
      "approver_role": "finance_manager"
    },
    {
      "id": "DEFAULT_ALLOW",
      "description": "Allow all other actions",
      "match": {
        "tool_name": "*",
        "environment": "*"
      },
      "outcome": "ALLOW"
    }
  ],

  "defaults": {
    "outcome": "DENY"
  }
}
```

> **Security Note:** The `defaults.outcome` is your last line of defense. Production deployments should use `"DENY"` as the default to enforce fail-closed behavior.

---

## Match Conditions

Match conditions determine whether a rule applies to a given request. All match conditions must be true.

### `tool_name`

| Pattern | Example | Matches |
|---------|---------|---------|
| Exact string | `"send_email"` | Only `send_email` |
| Array of strings | `["send_email", "send_slack"]` | Either tool |
| Glob prefix | `"query_*"` | `query_database`, `query_logs`, etc. |
| Wildcard | `"*"` | Any tool |

### `environment`

Any string value or `"*"` for all environments. Common values: `"dev"`, `"staging"`, `"prod"`, `"sandbox"`.

```json
{ "match": { "tool_name": "*", "environment": "prod" } }
```

### `agent_type`

Filter by agent classification. Accepts a single type or array.

```json
{ "match": { "tool_name": "*", "environment": "*", "agent_type": "autonomous_agent" } }
```

```json
{ "match": { "tool_name": "*", "environment": "*", "agent_type": ["autonomous_agent", "workflow_agent"] } }
```

### `trust_level_min`

Agent must meet or exceed the specified trust level. Trust hierarchy: `untrusted` (0) < `basic` (1) < `verified` (2) < `privileged` (3) < `system` (4).

```json
{
  "id": "PRIVILEGED_ONLY",
  "match": { "tool_name": "trigger_payment", "environment": "prod", "trust_level_min": "privileged" },
  "outcome": "ALLOW"
}
```

This rule matches agents with trust level `privileged` or `system`.

### `agent_roles_any`

Agent must have at least one of the specified roles.

```json
{
  "match": { "tool_name": "query_customer_db", "environment": "*", "agent_roles_any": ["finance.reader", "support.reader"] }
}
```

### `tool_provider`

Filter by the tool's provider field from `ToolIdentity`. Accepts single string or array.

```json
{
  "match": { "tool_name": "*", "environment": "prod", "tool_provider": "mcp" },
  "outcome": "REQUIRE_APPROVAL"
}
```

---

## When Conditions

When conditions add data-level filtering on top of match conditions. All conditions must be true (AND logic).

### `contains_any`

At least one keyword must appear in the user input or tool arguments. Case-insensitive. Searches all string values recursively extracted from `tool_args`.

```json
{
  "when": { "contains_any": ["SELECT *", "export", "dump"] }
}
```

### `not_contains`

None of these keywords should appear. Useful for excluding safe operations.

```json
{
  "when": { "not_contains": ["safe_operation", "internal_only"] }
}
```

### `matches_regex`

Regular expression tested against searchable text (user input + tool args concatenated). Patterns are validated for ReDoS safety — unsafe patterns (nested quantifiers, overlapping alternations) are rejected and the rule fails closed.

```json
{
  "when": { "matches_regex": "^SELECT\\s+\\*\\s+FROM" }
}
```

> **Security Note:** Regex patterns are limited to 512 characters. Patterns with catastrophic backtracking potential are rejected at policy load time.

### `data_labels_any`

At least one of the specified labels must be present in `context.data_labels`.

```json
{
  "when": { "data_labels_any": ["PII", "PCI"] }
}
```

### `tool_args_match`

Match specific values in `action.tool_args`. Supports exact equality and numeric operators.

**Exact match:**
```json
{
  "when": { "tool_args_match": { "recipient_type": "external" } }
}
```

**Numeric operators:**
```json
{
  "when": { "tool_args_match": { "amount": { "gt": 1000 }, "row_count": { "lte": 100 } } }
}
```

| Operator | Description |
|----------|-------------|
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `eq` | Equal (strict) |
| `neq` | Not equal (strict) |

---

## Decision Outcomes

### When to Use Each Outcome

| Outcome | Use Case | Example |
|---------|----------|---------|
| `ALLOW` | Action is safe, no further checks needed | Read-only queries in dev |
| `DENY` | Action is prohibited, no exception path | Bulk export in production |
| `REQUIRE_APPROVAL` | Action needs role-based human approval | Financial transactions > $1000 |
| `STEP_UP` | Agent needs additional identity verification | Accessing PII after session timeout |
| `REQUIRE_TICKET` | Action requires a change management ticket | Production database writes |
| `REQUIRE_HUMAN` | Hard human-in-the-loop, no automated bypass | Production deployments |

### Decision Tree

```
Is this action always safe?
  → Yes → ALLOW
  → No →
    Should this action never happen?
      → Yes → DENY
      → No →
        Does this need identity re-verification?
          → Yes → STEP_UP
          → No →
            Does this need a change ticket?
              → Yes → REQUIRE_TICKET
              → No →
                Must a human physically approve each time?
                  → Yes → REQUIRE_HUMAN
                  → No → REQUIRE_APPROVAL
```

### Callback Requirements

Each non-ALLOW/DENY outcome requires a corresponding callback in `AgentSecurityConfig`:

| Outcome | Callback | Returns |
|---------|----------|---------|
| `REQUIRE_APPROVAL` | `onApprovalRequired` | `Promise<boolean>` |
| `STEP_UP` | `onStepUpRequired` | `Promise<boolean>` |
| `REQUIRE_TICKET` | `onTicketRequired` | `Promise<string \| null>` (ticket ID or null) |
| `REQUIRE_HUMAN` | `onHumanRequired` | `Promise<boolean>` |

If no callback is configured, the outcome defaults to DENY.

---

## Common Patterns

### Data Protection

Block sensitive data from leaving the system:

```json
{
  "id": "BLOCK_PII_EMAIL",
  "description": "Prevent PII from being sent via email",
  "match": { "tool_name": "send_email", "environment": "*" },
  "when": { "data_labels_any": ["PII"] },
  "outcome": "DENY"
}
```

### Financial Controls

Tiered approval for financial operations:

```json
[
  {
    "id": "ALLOW_SMALL_PAYMENT",
    "description": "Small payments auto-approved",
    "match": { "tool_name": "trigger_payment", "environment": "*" },
    "when": { "tool_args_match": { "amount": { "lte": 100 } } },
    "outcome": "ALLOW"
  },
  {
    "id": "APPROVE_MEDIUM_PAYMENT",
    "description": "Medium payments need manager approval",
    "match": { "tool_name": "trigger_payment", "environment": "*" },
    "when": { "tool_args_match": { "amount": { "lte": 10000 } } },
    "outcome": "REQUIRE_APPROVAL",
    "approver_role": "finance_manager"
  },
  {
    "id": "HUMAN_LARGE_PAYMENT",
    "description": "Large payments require human-in-the-loop",
    "match": { "tool_name": "trigger_payment", "environment": "*" },
    "outcome": "REQUIRE_HUMAN"
  }
]
```

### Environment Gating

Different controls per environment:

```json
[
  {
    "id": "DEV_ALLOW_ALL",
    "description": "Allow everything in development",
    "match": { "tool_name": "*", "environment": "dev" },
    "outcome": "ALLOW"
  },
  {
    "id": "PROD_DENY_DANGEROUS",
    "description": "Block dangerous operations in production",
    "match": { "tool_name": ["drop_table", "truncate_table"], "environment": "prod" },
    "outcome": "DENY"
  }
]
```

### Trust-Based Access

Use trust levels to gate sensitive operations:

```json
[
  {
    "id": "SYSTEM_FULL_ACCESS",
    "description": "System agents have unrestricted access",
    "match": { "tool_name": "*", "environment": "*", "trust_level_min": "system" },
    "outcome": "ALLOW"
  },
  {
    "id": "UNTRUSTED_DENY_WRITE",
    "description": "Untrusted agents cannot write",
    "match": { "tool_name": "write_*", "environment": "*" },
    "outcome": "DENY"
  }
]
```

### Agent Type Controls

Restrict autonomous agents more heavily:

```json
{
  "id": "AUTO_AGENT_TICKET",
  "description": "Autonomous agents need tickets for DB writes",
  "match": { "tool_name": "write_db", "environment": "prod", "agent_type": "autonomous_agent" },
  "outcome": "REQUIRE_TICKET"
}
```

---

## Policy Integrity

### HMAC Signatures

Sign policies to detect tampering:

```typescript
import { PolicyBundleLoader } from '@agent-security/core';

// Sign a policy bundle
const signed = PolicyBundleLoader.signBundle(bundle, process.env.POLICY_SECRET);

// Load with signature verification
const verified = PolicyBundleLoader.loadFromFile('./policy.json', {
  signatureSecret: process.env.POLICY_SECRET,
});
```

Signature verification uses constant-time comparison to prevent timing attacks.

### Expiration

Every policy bundle must have `generated_at` and `expires_at` timestamps. The loader rejects:
- Expired bundles (`expires_at < now`)
- Invalid dates
- Bundles where `generated_at >= expires_at`

---

## Loading Methods

### From File (Sync)

```typescript
const security = new AgentSecurity({
  policyPath: './policy.json',
});
```

### From JSON String (Sync)

```typescript
const security = new AgentSecurity({
  policyJson: JSON.stringify(policyBundle),
});
```

### From Object (Sync)

```typescript
const security = new AgentSecurity({
  policyBundle: {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    rules: [...],
    defaults: { outcome: "DENY" },
  },
});
```

### Async Loader

For remote policy servers, vaults, or databases:

```typescript
const security = new AgentSecurity({
  policyLoader: async () => {
    const res = await fetch('https://policies.company.com/v1/agent-policy');
    return await res.json();
  },
});

await security.init(); // Required for async loaders
```

### Hot Reload

Update policies at runtime without restarting:

```typescript
// Reload from original file
security.reloadPolicy();

// Reload from a different file
security.reloadPolicy('/path/to/new-policy.json');

// Reload from async source
await security.reloadPolicyAsync(async () => {
  return await fetchLatestPolicy();
});
```

---

## Policy Testing Strategies

### 1. Start Permissive, Tighten Incrementally

Begin with `defaults.outcome: "ALLOW"` and add specific DENY rules as you identify risks. Move to `defaults.outcome: "DENY"` once your allow-list is complete.

### 2. Environment-Based Rollout

Test policies in dev/staging before production:

```json
{
  "id": "STAGING_TEST_RULE",
  "match": { "tool_name": "risky_tool", "environment": "staging" },
  "outcome": "DENY"
}
```

### 3. Audit-First Deployment

Use `onAuditEvent` to log all decisions before enforcing. Review the audit trail to validate rule coverage before switching defaults to DENY.

### 4. Unit Test Rules

Construct test requests and evaluate them against your policy:

```typescript
const security = new AgentSecurity({ policyBundle: testPolicy });

const result = await security.checkToolCall({
  toolName: 'trigger_payment',
  toolArgs: { amount: 5000 },
  agentId: 'test-agent',
  environment: 'prod',
  trustLevel: 'basic',
});

assert.strictEqual(result.allowed, false);
assert.strictEqual(result.decision.outcome, 'DENY');
```

---

## Cross-References

- **Schema definitions** — [docs/schemas.md](./schemas.md)
- **Architecture and pipeline** — [docs/architecture.md](./architecture.md)
- **Security properties** — [SECURITY.md](../SECURITY.md)
- **Package plugins** — [docs/packages.md](./packages.md)
