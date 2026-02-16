# Examples

Integration examples and demos for the Agent-SPM platform.

---

## Quick Reference

| Example | Command | Demonstrates |
|---------|---------|-------------|
| Basic Usage | `npx ts-node examples/basic-usage.ts` | Minimal integration, policy check, audit log |
| Custom Approval | `npx ts-node examples/custom-approval.ts` | Approval workflow with timeout |
| Protect Wrapper | `npx ts-node examples/protect-wrapper.ts` | Function wrapping with `protect()` |
| Plugins Demo | `npx ts-node examples/plugins-demo.ts` | Kill switch, rate limiter, session context, output validator |
| Identity & AuthZ | `npm run demo:identity` | Agent registry, trust evaluation, identity enforcement |
| Egress & DLP | `npm run demo:egress` | Data classification, egress channel control, compliance reporting |
| Supply Chain | `npm run demo:supply-chain` | MCP scanning, tool provenance, command governance |
| Guardian & Posture | `npm run demo:guardian` | Anomaly detection, auto-kill, risk scoring, compliance mapping |
| Full SPM | `npm run demo:full-spm` | All packages integrated — end-to-end security posture management |

---

## Standalone Examples

### basic-usage.ts

Simplest integration — initialize the platform with a policy, check a tool call, read the audit log.

```bash
npx ts-node examples/basic-usage.ts
```

### custom-approval.ts

Custom approval workflow with configurable timeout. Shows how to integrate with Slack, email, or ticketing systems via the `onApprovalRequired` callback.

```bash
npx ts-node examples/custom-approval.ts
```

### protect-wrapper.ts

Wrap existing async functions with `protect()` for automatic security checks and Phase 5 output validation.

```bash
npx ts-node examples/protect-wrapper.ts
```

### plugins-demo.ts

Demonstrates all four built-in core plugins:
- **Kill Switch** — Emergency agent disable and revive
- **Rate Limiter** — Per-agent and per-tool rate limits
- **Session Context** — Cross-call session tracking with per-tool budgets
- **Output Validator** — Post-execution scanning for sensitive data (SSN, credit cards)

```bash
npx ts-node examples/plugins-demo.ts
```

---

## Integration Demos

These demos showcase the full Agent-SPM package ecosystem. Each builds on concepts from the previous, forming a learning progression.

### 01 — Identity & Authorization

**Directory:** `examples/01-identity-authz/`
**Command:** `npm run demo:identity`

Demonstrates agent and tool identity management:
- `AgentRegistry` — Register agents with trust levels and roles
- `ToolRegistry` — Register tools with provider and permissions
- `TrustEvaluator` — Compute effective trust from contextual factors
- `identityEnforcer` — Plugin that denies unregistered or low-trust agents
- Trust-based policy rules with `trust_level_min` and `agent_roles_any`

**Key concepts:** Agent identity, trust hierarchy, role-based access control

### 02 — Egress & DLP

**Directory:** `examples/02-egress-dlp/`
**Command:** `npm run demo:egress`

Demonstrates data loss prevention:
- Built-in classifiers detecting PII, PCI, and secrets in tool arguments
- Egress channel mapping (email, HTTP, database, etc.)
- Destination policy enforcement (block PII via email, block PCI everywhere)
- `ComplianceReporter` generating DLP evidence reports

**Key concepts:** Data classification, egress control, compliance evidence

### 03 — Supply Chain Security

**Directory:** `examples/03-supply-chain/`
**Command:** `npm run demo:supply-chain`

Demonstrates tool supply chain security:
- `McpScanner` — Analyze MCP server manifests for security risks
- `ToolProvenance` — SHA-256 manifest hash verification
- `CommandGovernor` — Pattern-based shell command control
- `supplyChainGuard` — Plugin combining all supply chain checks

**Key concepts:** Tool provenance, MCP security, command governance

### 04 — Guardian & Posture

**Directory:** `examples/04-guardian-posture/`
**Command:** `npm run demo:guardian`

Demonstrates runtime monitoring and posture management:
- `GuardianAgent` — Anomaly detection (frequency spikes, volume, off-hours)
- Auto-kill on threshold breach
- `PostureInventory` — Asset tracking
- `RiskScorer` — Fleet risk scoring (0-100)
- `ComplianceMapper` — EU AI Act and UK AI Governance reports
- `SocFormatter` — CEF event formatting for SIEM

**Key concepts:** Anomaly detection, risk scoring, compliance mapping, SIEM integration

### 05 — Full SPM

**Directory:** `examples/05-full-spm/`
**Command:** `npm run demo:full-spm`

End-to-end integration of all security packages in a single deployment:
- Identity enforcement + trust-based policies
- DLP classification + egress control
- Supply chain verification + command governance
- Sandbox constraints + change control
- Guardian anomaly detection + auto-kill
- Risk scoring + compliance reports + SIEM export

**9 scenarios:** Privileged payment, low-trust denial, PII email block, clean email pass, blocked shell command, deployment with human approval, sandbox violation, unregistered agent block, rogue bot auto-kill

**Key concepts:** Defense in depth, full security posture management

---

## Learning Progression

| Step | Demo | What You Learn |
|------|------|---------------|
| 1 | basic-usage | Core platform, policy evaluation, audit |
| 2 | plugins-demo | Plugin pipeline, built-in protections |
| 3 | 01-identity-authz | Identity, trust, role-based access |
| 4 | 02-egress-dlp | Data loss prevention, egress control |
| 5 | 03-supply-chain | Tool verification, command governance |
| 6 | 04-guardian-posture | Anomaly detection, compliance, SIEM |
| 7 | 05-full-spm | Everything together |

---

## Creating Custom Plugins

```typescript
import { SecurityPlugin, BeforeCheckContext, PluginResult } from '@agent-security/core';

const myPlugin: SecurityPlugin = {
  name: 'my-custom-plugin',
  version: '1.0.0',
  failOpen: false, // Fail-closed (deny on error)

  async initialize() {
    // Setup: connect to external services, load state
  },

  async beforeCheck(ctx: BeforeCheckContext): Promise<PluginResult | void> {
    // Return { decision: { outcome: 'DENY', reasons: [...] } } to short-circuit
    // Return { modifiedRequest: ... } to modify the request
    // Return void to continue to next plugin
  },

  async afterDecision(ctx) {
    // Inspect or modify the decision after policy evaluation
  },

  async afterExecution(ctx) {
    // Validate output, enrich audit (protect() wrapper only)
  },

  async destroy() {
    // Cleanup: disconnect, flush logs
  },
};
```

See the [plugin system reference](../docs/schemas.md#plugin-system) for the full `SecurityPlugin` interface.

---

## Cross-References

- **Quick start** — [QUICKSTART.md](../QUICKSTART.md)
- **Package reference** — [docs/packages.md](../docs/packages.md)
- **Architecture** — [docs/architecture.md](../docs/architecture.md)
- **Policy authoring** — [docs/policies.md](../docs/policies.md)
- **Compliance** — [docs/compliance.md](../docs/compliance.md)
- **Security** — [SECURITY.md](../SECURITY.md)
