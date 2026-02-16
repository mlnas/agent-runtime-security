# Schema Reference (v0.3)

Complete type definitions for the Agent-SPM platform. Source of truth: [`core/src/schemas.ts`](../core/src/schemas.ts).

---

## Version History

| Version | Changes |
|---------|---------|
| v0.1 | Initial schemas: `AgentActionRequest`, `Decision`, `Event`, `PolicyBundle`, `PolicyRule` |
| v0.2 | Flexible environments (any string), extensible context, advanced `when` conditions (`not_contains`, `matches_regex`, `tool_args_match`), plugin system (`SecurityPlugin`, lifecycle hooks), 3 decision outcomes |
| v0.3 | Agent identity (`AgentIdentity`, `AgentTrustLevel`, `AgentType`, `AgentAttestation`), tool identity (`ToolIdentity`), identity-aware policy matching (`agent_type`, `trust_level_min`, `agent_roles_any`, `tool_provider`), 6 decision outcomes (`STEP_UP`, `REQUIRE_TICKET`, `REQUIRE_HUMAN`), 11 event outcomes, delegation chains |

---

## Agent Identity

### `AgentTrustLevel`

Hierarchical trust levels. Higher levels inherit all privileges of lower levels.

```typescript
type AgentTrustLevel = 'untrusted' | 'basic' | 'verified' | 'privileged' | 'system';
```

| Level | Numeric | Description |
|-------|---------|-------------|
| `untrusted` | 0 | Unknown or unverified agent. Most restrictive. |
| `basic` | 1 | Registered but minimally verified. |
| `verified` | 2 | Identity confirmed, standard operations. |
| `privileged` | 3 | Elevated access for sensitive operations. |
| `system` | 4 | Internal platform agents. Highest trust. |

### `AgentType`

```typescript
type AgentType = 'ide_agent' | 'pr_agent' | 'chat_agent' | 'workflow_agent' | 'autonomous_agent' | string;
```

Built-in types cover common agent categories. Custom strings are accepted for organization-specific types.

### `AgentAttestation`

Cryptographic proof of agent identity.

```typescript
interface AgentAttestation {
  issuer: string;           // Who issued the attestation
  issued_at: string;        // ISO-8601
  expires_at?: string;      // ISO-8601
  signature?: string;       // Cryptographic signature
}
```

### `AgentIdentity`

Full agent identity descriptor. Used by the [identity package](./packages.md#agent-securityidentity) for registration and trust evaluation.

```typescript
interface AgentIdentity {
  agent_id: string;
  name: string;
  owner: string;                      // Email or team identifier
  environment: string;                // Any string: "dev", "staging", "prod", "sandbox", etc.
  agent_type?: AgentType;
  trust_level?: AgentTrustLevel;
  roles?: string[];                   // e.g. 'finance.reader', 'email.sender'
  capabilities?: string[];            // e.g. 'tool_call', 'code_execute', 'web_browse'
  max_delegation_depth?: number;      // Max levels of agent-to-agent delegation
  attestation?: AgentAttestation;
}
```

---

## Tool Identity

### `ToolIdentity`

Metadata for verifying tool provenance and permissions. Used by the [supply chain package](./packages.md#agent-securitysupply-chain) for manifest verification.

```typescript
interface ToolIdentity {
  tool_name: string;
  version?: string;
  provider?: string;                  // 'built-in' | 'mcp' | 'langchain' | 'custom'
  manifest_hash?: string;             // SHA-256 hash for integrity verification
  permissions_required?: string[];    // e.g. 'network.outbound', 'fs.read'
  data_access?: string[];             // Data categories this tool accesses
  verified?: boolean;                 // Whether provenance has been verified
}
```

---

## Agent Action Request

### `AgentActionRequest`

The canonical request object evaluated by the policy engine. Constructed internally from [`CheckToolCallParams`](#checktoolcallparams).

```typescript
interface AgentActionRequest {
  request_id: string;       // UUID v4
  timestamp: string;        // ISO-8601

  agent: {
    agent_id: string;
    name: string;
    owner: string;
    environment: string;
    agent_type?: AgentType;
    trust_level?: AgentTrustLevel;
    roles?: string[];
    capabilities?: string[];
    max_delegation_depth?: number;
    attestation?: AgentAttestation;
  };

  action: {
    type: string;           // "tool_call", "memory_access", "web_browse", "code_execute", etc.
    tool_name: string;
    tool_args: Record<string, any>;
    tool_identity?: ToolIdentity;
  };

  context: {
    user_input?: string;
    data_labels?: string[];        // e.g. ["PII", "PCI"]
    risk_hints?: string[];         // e.g. ["BULK_EXPORT", "EXTERNAL_SEND"]
    trace_id?: string;
    session_id?: string;
    parent_agent_id?: string;      // For multi-agent hierarchies
    delegation_chain?: string[];   // Ordered list of agent IDs in the delegation path
    [key: string]: any;            // Extensible context
  };
}
```

---

## Decision

### `DecisionOutcome`

```typescript
type DecisionOutcome =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_APPROVAL"
  | "STEP_UP"
  | "REQUIRE_TICKET"
  | "REQUIRE_HUMAN";
```

| Outcome | Description | Callback |
|---------|-------------|----------|
| `ALLOW` | Action permitted. Executes immediately. | `onAllow` |
| `DENY` | Action blocked. Never executes. | `onDeny` |
| `REQUIRE_APPROVAL` | Needs manager/role-based approval. | `onApprovalRequired` |
| `STEP_UP` | Requires additional identity verification. | `onStepUpRequired` |
| `REQUIRE_TICKET` | Requires a valid change ticket (Jira, Linear, GitHub). | `onTicketRequired` |
| `REQUIRE_HUMAN` | Hard human-in-the-loop. No automated bypass. | `onHumanRequired` |

See the [policies guide](./policies.md#decision-outcomes) for when to use each outcome.

### `Decision`

```typescript
interface Decision {
  outcome: DecisionOutcome;
  reasons: Array<{
    code: string;          // Rule ID or system code
    message: string;       // Human-readable explanation
  }>;
  approver_role?: string;
  constraints?: Record<string, any>;  // e.g. { max_rows: 100, rate_limit_per_min: 10 }
}
```

---

## Audit Event

### `EventOutcome`

Superset of `DecisionOutcome` with lifecycle states.

```typescript
type EventOutcome =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_APPROVAL"
  | "STEP_UP"
  | "REQUIRE_TICKET"
  | "REQUIRE_HUMAN"
  | "APPROVED"
  | "REJECTED"
  | "KILL_SWITCH"
  | "RATE_LIMITED"
  | "TIMEOUT";
```

| Outcome | Source |
|---------|--------|
| `APPROVED` | Approval callback returned `true` |
| `REJECTED` | Approval callback returned `false` |
| `KILL_SWITCH` | Kill switch plugin blocked the agent |
| `RATE_LIMITED` | Rate limiter plugin blocked the request |
| `TIMEOUT` | Approval callback timed out |

### `Event`

```typescript
interface Event {
  event_id: string;        // UUID v4
  timestamp: string;       // ISO-8601
  request_id: string;      // Links to the original request
  agent_id: string;
  tool_name: string;
  outcome: EventOutcome;
  reasons: Array<{
    code: string;
    message: string;
  }>;
  safe_payload: Record<string, any>;  // Redacted request data
  plugin_source?: string;             // Which plugin generated this event
}
```

> **Security Note:** The `safe_payload` field contains redacted data only. Raw tool arguments are never stored in audit events.

---

## Policy Rules

### `PolicyRule`

A single rule in the policy bundle. Rules are evaluated in order; first match wins. See the [policies guide](./policies.md) for authoring details.

```typescript
interface PolicyRule {
  id: string;
  description: string;

  match: {
    tool_name: string | string[];          // Exact, array, glob prefix ("query_*"), or "*"
    environment: string;                   // Any string or "*"
    agent_type?: AgentType | AgentType[];  // Filter by agent type
    trust_level_min?: AgentTrustLevel;     // Minimum trust level required
    agent_roles_any?: string[];            // Agent must have at least one role
    tool_provider?: string | string[];     // Filter by tool provider
  };

  when?: {
    contains_any?: string[];               // At least one keyword in user_input + tool_args
    not_contains?: string[];               // None of these keywords should appear
    matches_regex?: string;                // Regex pattern (ReDoS-safe)
    data_labels_any?: string[];            // At least one data label present
    tool_args_match?: Record<string, any>; // Match specific tool_args values
  };

  outcome: DecisionOutcome;
  approver_role?: string;
  constraints?: Record<string, any>;
}
```

#### Match Fields

| Field | Type | Description |
|-------|------|-------------|
| `tool_name` | `string \| string[]` | Exact name, array of names, glob prefix (`query_*`), or wildcard `*` |
| `environment` | `string` | Any environment string or `*` for all |
| `agent_type` | `AgentType \| AgentType[]` | Optional. Match one or more agent types. |
| `trust_level_min` | `AgentTrustLevel` | Optional. Agent must meet or exceed this trust level. |
| `agent_roles_any` | `string[]` | Optional. Agent must have at least one of these roles. |
| `tool_provider` | `string \| string[]` | Optional. Match tool provider (from `ToolIdentity`). |

#### When Conditions

All conditions must be true for the rule to match (AND logic).

| Condition | Type | Description |
|-----------|------|-------------|
| `contains_any` | `string[]` | At least one keyword appears in user input or tool args (case-insensitive). |
| `not_contains` | `string[]` | None of these keywords appear in user input or tool args (case-insensitive). |
| `matches_regex` | `string` | Regex pattern tested against searchable text. Unsafe patterns are rejected (fail-closed). Max length: 512 chars. |
| `data_labels_any` | `string[]` | At least one of these data labels is present in `context.data_labels`. |
| `tool_args_match` | `Record<string, any>` | Each key must match in `action.tool_args`. Supports numeric operators. |

#### Numeric Operators for `tool_args_match`

```json
{ "amount": { "gt": 1000 } }
```

| Operator | Description |
|----------|-------------|
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `eq` | Equal (strict) |
| `neq` | Not equal (strict) |

### `PolicyBundle`

```typescript
interface PolicyBundle {
  version: string;
  generated_at: string;       // ISO-8601
  expires_at: string;         // ISO-8601
  rules: PolicyRule[];
  defaults: {
    outcome: DecisionOutcome;
  };
  signature?: string;         // HMAC-SHA256 for integrity verification
}
```

> **Security Note:** Expired policy bundles are rejected at load time. Use HMAC signatures for tamper detection — see [SECURITY.md](../SECURITY.md#policy-integrity).

---

## Plugin System

### `SecurityPlugin`

Interface that all security plugins must implement. Plugins hook into the 5-phase evaluation pipeline.

```typescript
interface SecurityPlugin {
  readonly name: string;
  readonly version?: string;
  readonly failOpen?: boolean;      // Default: false (fail-closed)

  initialize?(): Promise<void>;
  beforeCheck?(context: BeforeCheckContext): Promise<PluginResult | void>;
  afterDecision?(context: AfterDecisionContext): Promise<PluginResult | void>;
  afterExecution?(context: AfterExecutionContext): Promise<void>;
  destroy?(): Promise<void>;
}
```

| Phase | Hook | Can Short-Circuit | Description |
|-------|------|-------------------|-------------|
| 1 | `beforeCheck` | Yes | Kill switch, rate limiting, identity checks |
| 2 | *(evaluation)* | — | Core policy engine (not a plugin hook) |
| 3 | `afterDecision` | Yes | Modify decisions, apply timeouts |
| 5 | `afterExecution` | No | Output validation, audit enrichment |

> **Security Note:** Plugins default to `failOpen: false`. If a plugin throws, the request is denied. Security-critical plugins (kill switch, rate limiter) should never set `failOpen: true`.

### `BeforeCheckContext`

```typescript
interface BeforeCheckContext {
  request: AgentActionRequest;
}
```

### `AfterDecisionContext`

```typescript
interface AfterDecisionContext {
  request: AgentActionRequest;
  decision: Decision;
}
```

### `AfterExecutionContext`

```typescript
interface AfterExecutionContext {
  request: AgentActionRequest;
  decision: Decision;
  result?: any;
  error?: Error;
}
```

### `PluginResult`

```typescript
interface PluginResult {
  decision?: Decision;                    // Short-circuit with this decision
  modifiedRequest?: AgentActionRequest;   // Replace request for subsequent processing
}
```

---

## API Surface

### `CheckToolCallParams`

The simplified parameter object passed to `AgentSecurity.checkToolCall()`. The platform constructs an `AgentActionRequest` internally.

```typescript
interface CheckToolCallParams {
  toolName: string;
  toolArgs: Record<string, any>;
  agentId: string;
  agentName?: string;
  environment?: string;
  owner?: string;
  actionType?: string;
  userInput?: string;
  dataLabels?: string[];
  riskHints?: string[];
  sessionId?: string;
  parentAgentId?: string;

  // Identity-aware fields
  agentType?: AgentType;
  trustLevel?: AgentTrustLevel;
  roles?: string[];
  capabilities?: string[];
  maxDelegationDepth?: number;
  attestation?: AgentAttestation;
  toolIdentity?: ToolIdentity;
  delegationChain?: string[];
}
```

### `SecurityCheckResult`

```typescript
interface SecurityCheckResult {
  allowed: boolean;
  decision: Decision;
  event: Event;
}
```

### `AgentSecurityConfig`

Full configuration for the `AgentSecurity` constructor. See [QUICKSTART.md](../QUICKSTART.md) for usage examples.

```typescript
interface AgentSecurityConfig {
  // Policy sources (at least one required)
  policyPath?: string;
  policyJson?: string;
  policyBundle?: PolicyBundle;
  policyLoader?: () => Promise<PolicyBundle | string>;

  // Plugins
  plugins?: SecurityPlugin[];

  // Callbacks
  onApprovalRequired?: (request: AgentActionRequest, decision: Decision) => Promise<boolean>;
  onStepUpRequired?: (request: AgentActionRequest, decision: Decision) => Promise<boolean>;
  onTicketRequired?: (request: AgentActionRequest, decision: Decision) => Promise<string | null>;
  onHumanRequired?: (request: AgentActionRequest, decision: Decision) => Promise<boolean>;
  onDeny?: (request: AgentActionRequest, decision: Decision) => void;
  onAllow?: (request: AgentActionRequest, decision: Decision) => void;
  onAuditEvent?: (event: Event) => void;
  onError?: (error: Error, context: string) => void;

  // Defaults
  defaultEnvironment?: string;
  defaultOwner?: string;
  approvalTimeoutMs?: number;
  maxAuditLogSize?: number;         // Default: 10,000. FIFO eviction.
}
```

---

## Cross-References

- **Policy authoring** — [docs/policies.md](./policies.md)
- **Package APIs** — [docs/packages.md](./packages.md)
- **Architecture** — [docs/architecture.md](./architecture.md)
- **Security properties** — [SECURITY.md](../SECURITY.md)
