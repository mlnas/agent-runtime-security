# Architecture

System design and security architecture for the Agent-SPM platform.

---

## Overview

Agent-SPM is a **lightweight, in-process security enforcement platform** for AI agent tool calls. It runs in the same process as your agent code — no gateway, no sidecar, no infrastructure to manage.

## Design Philosophy

### 1. Zero Infrastructure
The platform runs in-process. No HTTP calls, no network latency, no deployment complexity. Policy evaluation completes in microseconds.

### 2. Policy as Code
Security policies are JSON files versioned in Git and deployed with your application. HMAC-SHA256 signatures ensure integrity.

### 3. Defense in Depth
Multiple independent security layers — identity verification, policy evaluation, DLP classification, supply chain verification, anomaly detection — each operating independently. A failure in one layer doesn't compromise others.

### 4. Fail-Closed
Every component defaults to denial on error. Plugins fail closed unless explicitly configured otherwise. Missing callbacks result in denial. Expired policies are rejected.

### 5. Least Privilege
Trust levels, role-based matching, and agent type controls ensure agents only access what they need. Delegation depth limits prevent privilege escalation through agent chains.

### 6. Integration First
Designed to wrap around existing tool functions with minimal code changes. Framework adapters for Cursor, Claude Code, LangChain, and CrewAI.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Your Agent Code                                │
│                                                                         │
│  ┌─── Framework Adapters ──────────────────────────────────────────┐   │
│  │  Cursor MCP │ Claude Code │ LangChain │ CrewAI                  │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌─── AgentSecurity Core ───────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Phase 1: beforeCheck Plugins                                     │  │
│  │  ┌────────────┐ ┌──────────┐ ┌─────────┐ ┌─────────────────┐    │  │
│  │  │Kill Switch │ │Rate Limit│ │Identity │ │Egress/DLP       │    │  │
│  │  └────────────┘ └──────────┘ └─────────┘ └─────────────────┘    │  │
│  │  ┌──────────────┐ ┌────────────────┐                             │  │
│  │  │Supply Chain  │ │Containment     │                             │  │
│  │  └──────────────┘ └────────────────┘                             │  │
│  │                       ↓                                           │  │
│  │  Phase 2: Policy Evaluation                                      │  │
│  │  ┌──────────────────────────────────┐                            │  │
│  │  │ PolicyEvaluator (first-match)    │ ← PolicyBundle (JSON)      │  │
│  │  └──────────────────────────────────┘                            │  │
│  │                       ↓                                           │  │
│  │  Phase 3: afterDecision Plugins                                  │  │
│  │                       ↓                                           │  │
│  │  Phase 4: Decision Callbacks                                     │  │
│  │  ┌──────────┐ ┌──────┐ ┌─────────┐ ┌────────┐ ┌──────┐         │  │
│  │  │onApproval│ │onDeny│ │onStepUp │ │onTicket│ │onHuman│        │  │
│  │  └──────────┘ └──────┘ └─────────┘ └────────┘ └──────┘         │  │
│  │                       ↓                                           │  │
│  │  Phase 5: afterExecution Plugins (protect() only)                │  │
│  │                       ↓                                           │  │
│  │  Audit Event → onAuditEvent callback                             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ↓                                          │
│  ┌─── External Systems ────────────────────────────────────────────┐   │
│  │  Guardian │ Posture │ SIEM │ Ticketing │ Slack │ Audit Storage  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Plugin Pipeline

The evaluation pipeline has 5 phases. Plugins hook into phases 1, 3, and 5.

### Phase 1: beforeCheck

Runs before policy evaluation. Plugins can short-circuit with an immediate decision.

| Plugin | Package | Action |
|--------|---------|--------|
| Kill switch | core | DENY if agent is killed |
| Rate limiter | core | DENY if rate exceeded |
| Session context | core | DENY if session limit exceeded |
| Identity enforcer | identity | DENY if agent unregistered or below trust threshold |
| Egress enforcer | egress | DENY if sensitive data detected in unauthorized channel |
| Supply chain guard | supply-chain | DENY if tool provenance fails or command blocked |
| Containment plugin | containment | DENY if sandbox violation or missing ticket |

### Phase 2: Policy Evaluation

Core policy engine. First-match rule processing against the `PolicyBundle`. See [policies.md](./policies.md).

Match pipeline per rule:
1. `tool_name` — exact, array, glob prefix, or wildcard
2. `environment` — exact or wildcard
3. `agent_type` — optional type filter
4. `trust_level_min` — optional minimum trust
5. `agent_roles_any` — optional role check
6. `tool_provider` — optional provider filter
7. `when` conditions — keyword, regex, data labels, tool args

### Phase 3: afterDecision

Runs after policy evaluation. Plugins can modify or override the decision.

### Phase 4: Decision Callbacks

The platform invokes the appropriate callback based on the decision outcome:

| Outcome | Callback | Behavior on Missing Callback |
|---------|----------|------------------------------|
| `ALLOW` | `onAllow` | Action proceeds |
| `DENY` | `onDeny` | Action blocked |
| `REQUIRE_APPROVAL` | `onApprovalRequired` | Denied (fail-closed) |
| `STEP_UP` | `onStepUpRequired` | Denied |
| `REQUIRE_TICKET` | `onTicketRequired` | Denied |
| `REQUIRE_HUMAN` | `onHumanRequired` | Denied |

All approval-type callbacks support configurable timeouts (`approvalTimeoutMs`). Timeouts result in denial.

### Phase 5: afterExecution

Runs only when using the `protect()` wrapper. Plugins inspect the tool's actual output for post-execution validation (e.g., scanning results for sensitive data).

---

## Package Architecture

Each package implements a specific security domain and plugs into the core pipeline through the `SecurityPlugin` interface.

```
                    ┌─────────────────┐
                    │  @agent-security │
                    │      /core       │
                    │                  │
                    │  Policy Engine   │
                    │  Plugin Pipeline │
                    │  Audit Events    │
                    └────────┬─────────┘
                             │
          ┌──────────┬───────┼───────┬──────────┬──────────┐
          ↓          ↓       ↓       ↓          ↓          ↓
    ┌──────────┐┌─────────┐┌──────┐┌─────────┐┌────────┐┌─────────┐
    │ identity ││ egress  ││supply││guardian ││posture ││containm.│
    │          ││         ││chain ││         ││        ││         │
    │Registry  ││DLP      ││MCP   ││Anomaly  ││Risk    ││Sandbox  │
    │Trust     ││Classify ││Prove.││AutoKill ││Comply  ││Tickets  │
    └──────────┘└─────────┘└──────┘└─────────┘└────────┘└─────────┘
          ↑                                                    ↑
    ┌──────────────────────────────────────────────────────────┐
    │                    @agent-security/adapters               │
    │         Cursor │ Claude Code │ LangChain │ CrewAI        │
    └──────────────────────────────────────────────────────────┘
```

### How Packages Hook In

| Package | Pipeline Phase | Hook Point |
|---------|---------------|------------|
| identity | Phase 1 (beforeCheck) | Validates agent registration and trust level |
| egress | Phase 1 (beforeCheck) | Scans tool args for sensitive data, checks egress policy |
| supply-chain | Phase 1 (beforeCheck) | Verifies tool provenance, governs commands |
| containment | Phase 1 (beforeCheck) | Checks sandbox constraints, validates tickets |
| guardian | External (onAuditEvent) | Processes events for anomaly detection |
| posture | External (on-demand) | Risk scoring, compliance reports, SIEM formatting |
| adapters | Entry point | Translates framework-specific calls to `checkToolCall()` |

---

## Data Flow

### Identity-Enriched Flow

```
Agent Request
    ↓
identityEnforcer (Phase 1)
    ├── Agent registered? → No → DENY
    ├── Agent revoked?    → Yes → DENY
    ├── Trust level met?  → No → DENY
    └── Continue
    ↓
PolicyEvaluator (Phase 2)
    ├── Match trust_level_min? → Check agent trust ≥ rule threshold
    ├── Match agent_roles_any? → Check agent has required role
    └── Standard evaluation
    ↓
Decision
```

### DLP Flow

```
Agent Request
    ↓
egressEnforcer (Phase 1)
    ├── Classify tool_args → PII? PCI? SECRET?
    ├── Map tool → egress channel
    ├── Check destination policy
    ├── Sensitive + unauthorized channel? → DENY
    └── Clean or authorized → Continue
    ↓
PolicyEvaluator (Phase 2)
    ↓
Decision
```

### Full Pipeline with Guardian and Posture

```
Agent Request
    ↓
Phase 1: kill-switch → rate-limiter → identity → egress → supply-chain → containment
    ↓
Phase 2: PolicyEvaluator
    ↓
Phase 3: afterDecision plugins
    ↓
Phase 4: Callbacks (onAllow/onDeny/onApproval/onStepUp/onTicket/onHuman)
    ↓
Audit Event created
    ↓
onAuditEvent callback
    ├── Guardian.processEvent() → anomaly detection → auto-kill
    ├── SocFormatter.toCef()    → SIEM export
    └── AuditExporter           → compliance evidence
    ↓
Phase 5: afterExecution (protect() only)
    ↓
Posture Dashboard (on-demand)
    ├── PostureInventory  → asset tracking
    ├── RiskScorer        → fleet risk scores
    └── ComplianceMapper  → EU AI Act / UK AI Gov reports
```

---

## Decision Types

| Outcome | Description | Requires Callback |
|---------|-------------|-------------------|
| `ALLOW` | Action permitted, executes immediately | No (optional `onAllow`) |
| `DENY` | Action blocked, never executes | No (optional `onDeny`) |
| `REQUIRE_APPROVAL` | Needs role-based approval | Yes (`onApprovalRequired`) |
| `STEP_UP` | Needs additional identity verification | Yes (`onStepUpRequired`) |
| `REQUIRE_TICKET` | Needs a valid change ticket | Yes (`onTicketRequired`) |
| `REQUIRE_HUMAN` | Hard human-in-the-loop, no automated bypass | Yes (`onHumanRequired`) |

---

## Threat Model

| Threat | Attack Vector | Agent-SPM Control |
|--------|--------------|-------------------|
| Data exfiltration | Agent sends PII/PCI via email or HTTP | Egress DLP classifiers + channel enforcement |
| Unauthorized actions | Agent calls tools beyond its scope | Trust levels, role matching, policy rules |
| Prompt injection | Malicious input crafted to bypass controls | `contains_any`, `matches_regex` scanning on tool args |
| Privilege escalation | Agent delegates to more privileged agent | Delegation depth limits, identity enforcement |
| Shadow agents | Unregistered agent makes tool calls | `requireRegistration: true` in identity enforcer |
| Supply chain attack | Compromised MCP server or tool | Manifest scanning, SHA-256 provenance, command governance |
| Policy tampering | Attacker modifies policy file | HMAC-SHA256 signatures, path traversal prevention |
| Rate-based abuse | Agent floods system with requests | Per-agent and per-tool rate limiting |
| Rogue agent behavior | Agent exhibits anomalous patterns | Guardian anomaly detection, auto-kill |
| Stale policy | Outdated policy allows deprecated actions | Policy expiration enforcement |

---

## Integration Patterns

### Pattern 1: Direct Check

Full control over the security check flow:

```typescript
const result = await security.checkToolCall({
  toolName: 'send_email',
  toolArgs: { to: 'user@example.com' },
  agentId: 'my-agent',
  environment: 'prod',
  trustLevel: 'verified',
  roles: ['email.sender'],
});

if (result.allowed) {
  await emailService.send(...);
}
```

### Pattern 2: Protect Wrapper

Decorative security with automatic Phase 5 output validation:

```typescript
const sendEmail = security.protect('send_email', emailService.send, {
  agentId: 'my-agent',
  environment: 'prod',
});

await sendEmail('user@example.com', 'Hello');
```

### Pattern 3: Framework Adapter

Use pre-built adapters for popular frameworks:

```typescript
import { createCursorMiddleware } from '@agent-security/adapters';

const middleware = createCursorMiddleware(security, {
  agentId: 'cursor-agent',
  environment: 'dev',
});
```

### Pattern 4: Full SPM Stack

All packages composed for enterprise deployment. See [`examples/05-full-spm/demo.ts`](../examples/05-full-spm/demo.ts).

```typescript
const security = new AgentSecurity({
  policyBundle,
  plugins: [
    identityEnforcer({ agentRegistry, toolRegistry, trustEvaluator }),
    egressEnforcer({ policy: egressPolicy, toolChannelMappings }),
    supplyChainGuard({ provenance, commandGovernor }),
    containmentPlugin({ sandboxManager, changeControl }),
  ],
  onAuditEvent: (event) => {
    guardian.processEvent(event);
    siem.send(socFormatter.toCef(event).raw);
  },
});
```

---

## Non-Goals

Agent-SPM intentionally does NOT:

- Run as a separate service or gateway
- Require infrastructure deployment
- Provide a policy management UI (separate concern)
- Enforce network-level controls
- Replace application authentication (OAuth, JWT)
- Harden the LLM model itself
- Provide persistent audit storage (use `onAuditEvent` to export)

---

## Cross-References

- **Schema definitions** — [docs/schemas.md](./schemas.md)
- **Policy authoring** — [docs/policies.md](./policies.md)
- **Package reference** — [docs/packages.md](./packages.md)
- **Security properties** — [SECURITY.md](../SECURITY.md)
- **Compliance** — [docs/compliance.md](./compliance.md)
