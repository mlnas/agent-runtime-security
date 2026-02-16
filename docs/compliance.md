# Compliance and Audit Guide

Regulatory compliance mapping, audit evidence, and SIEM integration for the Agent-SPM platform.

---

## EU AI Act Mapping

Agent-SPM provides controls that map to EU AI Act requirements for high-risk AI systems.

| Control ID | Title | Agent-SPM Implementation | Evidence |
|-----------|-------|-------------------------|----------|
| EU-AI-001 | Risk Management System | `RiskScorer` fleet scoring (0-100), `PostureInventory` asset tracking | Risk score reports, inventory snapshots |
| EU-AI-002 | Data Governance | `egressEnforcer` DLP classifiers, `data_labels` in policy rules | Egress event logs, classification reports |
| EU-AI-003 | Technical Documentation | Policy bundles as code, schema versioning, audit trail | Git-versioned policy JSON, `CHANGELOG.md` |
| EU-AI-004 | Record-Keeping | `Event` audit log with `plugin_source` attribution, `AuditExporter` | JSON/CSV audit exports, SIEM event stream |
| EU-AI-005 | Transparency | `Decision.reasons[]` with human-readable explanations, `approver_role` | Audit events with reason codes and messages |
| EU-AI-006 | Human Oversight | `REQUIRE_APPROVAL`, `REQUIRE_HUMAN`, `onHumanRequired` callbacks | Approval/rejection audit events |
| EU-AI-007 | Accuracy and Robustness | `GuardianAgent` anomaly detection, `killSwitch` emergency stop, `rateLimiter` | Guardian incident logs, kill switch activations |

### Generating an EU AI Act Report

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

// report.summary.compliance_score → percentage
// report.controls → array of ComplianceControl with status and evidence
```

---

## UK AI Governance Mapping

| Control ID | Title | Agent-SPM Implementation | Evidence |
|-----------|-------|-------------------------|----------|
| UK-AI-001 | Safety and Reliability | `killSwitch` emergency stop, `GuardianAgent` auto-kill, fail-closed defaults | Kill switch state, guardian incidents |
| UK-AI-002 | Transparency and Explainability | `Decision.reasons[]`, policy rules as readable JSON, audit trail | Policy bundles, decision audit events |
| UK-AI-003 | Fairness | `PolicyRule` match conditions (no opaque scoring), deterministic evaluation | Policy JSON (auditable rule logic) |
| UK-AI-004 | Accountability and Governance | `AgentIdentity` with owner/roles, `PostureInventory`, `ComplianceReporter` | Agent registry, compliance reports |
| UK-AI-005 | Contestability and Redress | `REQUIRE_HUMAN` outcome, `onApprovalRequired` callbacks, `reloadPolicy` | Human approval audit events, policy versions |

### Generating a UK AI Governance Report

```typescript
const ukReport = mapper.generateReport('uk_ai_governance', {
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

---

## Audit Evidence Inventory

Agent-SPM produces the following evidence artifacts for auditors:

| Evidence Type | Source | Format | Use |
|--------------|--------|--------|-----|
| Policy bundles | `getPolicyBundle()` | JSON | Rule logic audit |
| Audit events | `getAuditLog()`, `onAuditEvent` | JSON/CSV | Decision trail |
| Compliance reports | `ComplianceMapper.generateReport()` | JSON | Regulatory evidence |
| DLP reports | `ComplianceReporter.generateReport()` | JSON/CSV | Data protection evidence |
| Risk scores | `RiskScorer.scoreFleet()` | JSON | Risk posture assessment |
| SIEM events | `SocFormatter.toCef/toLeef/toJson()` | CEF/LEEF/JSON | Continuous monitoring |
| Guardian incidents | `GuardianAgent.getIncidents()` | JSON | Anomaly response evidence |
| Agent inventory | `PostureInventory.getAll()` | JSON | Asset management |

---

## SIEM Integration

### CEF (Common Event Format)

Compatible with Splunk, ArcSight, QRadar. Used by `SocFormatter.toCef()`.

```
CEF:0|AgentSPM|AgentSecurity|0.3.0|DENY|Agent Action Denied|8|
  src=agent-001 dst=send_email outcome=DENY reason=BLOCK_PII_EMAIL
```

### LEEF (Log Event Extended Format)

Compatible with IBM QRadar. Used by `SocFormatter.toLeef()`.

```
LEEF:2.0|AgentSPM|AgentSecurity|0.3.0|AgentActionDenied|
  src=agent-001 dst=send_email outcome=DENY reason=BLOCK_PII_EMAIL
```

### Structured JSON

Compatible with Elastic, Azure Sentinel, Datadog. Used by `SocFormatter.toJson()`.

```json
{
  "event_id": "uuid",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "agent_id": "finance-bot",
  "tool_name": "send_email",
  "outcome": "DENY",
  "reasons": [{ "code": "BLOCK_PII_EMAIL", "message": "PII detected in email" }],
  "severity": "high"
}
```

### Integration Patterns

**Splunk:**
```typescript
const security = new AgentSecurity({
  policyBundle,
  onAuditEvent: (event) => {
    const cef = socFormatter.toCef(event);
    splunkHec.send(cef.raw);
  },
});
```

**Elastic/OpenSearch:**
```typescript
onAuditEvent: (event) => {
  const json = socFormatter.toJson(event);
  elasticClient.index({ index: 'agent-spm-events', body: JSON.parse(json.raw) });
}
```

**Azure Sentinel:**
```typescript
onAuditEvent: (event) => {
  const json = socFormatter.toJson(event);
  sentinelClient.send('AgentSPM', JSON.parse(json.raw));
}
```

---

## Audit Preparation Checklist

Use this checklist when preparing for a compliance audit:

- [ ] **Policy bundles versioned in Git** — Every production policy change is in version control
- [ ] **Audit events exported to SIEM** — `onAuditEvent` callback connected to your SIEM
- [ ] **Agent inventory current** — All agents registered in `PostureInventory`
- [ ] **Risk scores generated** — `RiskScorer.scoreFleet()` run on current inventory
- [ ] **Compliance reports generated** — `ComplianceMapper.generateReport()` for relevant frameworks
- [ ] **DLP reports available** — `ComplianceReporter.generateReport()` for egress evidence
- [ ] **Human oversight documented** — `REQUIRE_APPROVAL` and `REQUIRE_HUMAN` rules in policy
- [ ] **Kill switch tested** — Emergency stop procedure documented and tested
- [ ] **Policy signatures enabled** — HMAC-SHA256 signatures on production bundles
- [ ] **Incident response plan** — Guardian anomaly thresholds configured and escalation path defined
- [ ] **Audit export available** — `AuditExporter.exportCsv()` for auditor-friendly format

---

## Cross-References

- **Package APIs** — [docs/packages.md](./packages.md)
- **Schema definitions** — [docs/schemas.md](./schemas.md)
- **Security properties** — [SECURITY.md](../SECURITY.md)
- **Architecture** — [docs/architecture.md](./architecture.md)
