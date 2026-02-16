# Agent-SPM: Runtime Security for AI Agents

> After ClaudeBot, how do you trust your AI agents in production?

[![Build Status](https://github.com/mlnas/agent-runtime-security/workflows/CI/badge.svg)](https://github.com/mlnas/agent-runtime-security/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Agent-SPM** enforces security policies on AI agent tool calls at runtime. Think of it as a **firewall for your agents** — block dangerous actions, require approvals, prevent data leaks, and generate compliance reports.

## Quick Start
```bash
npm install @agent-security/core
```
```typescript
import { AgentSecurity } from '@agent-security/core';

const security = new AgentSecurity({
  policyPath: './policy.json'
});

const result = await security.checkToolCall({
  toolName: 'send_email',
  toolArgs: { to: 'user@example.com', body: 'Hello!' },
  agentId: 'my-agent',
  environment: 'prod',
});

if (result.allowed) {
  await sendEmail(); // Your actual tool implementation
}
```

**[📖 Full quickstart guide](./QUICKSTART.md)** •

---

## Why Agent-SPM?

AI agents can cause serious damage:

| Risk | Without Agent-SPM | With Agent-SPM |
|------|-------------------|----------------|
| **Data exfiltration** | Agent exports entire customer database | Policy blocks `SELECT *` in production |
| **PII leaks** | Agent emails SSNs to external addresses | DLP classifier blocks PII in emails |
| **Prompt injection** | Malicious input bypasses safety checks | Policy validates all tool arguments |
| **Rogue behavior** | No way to stop a misbehaving agent | Kill switch stops agent instantly |
| **Compliance** | No audit trail or evidence | Automatic EU AI Act reports |

---

## Key Features

| Feature | Description |
|---------|-------------|
| ⚡ **Zero infrastructure** | Runs in-process, no gateway |
| 🛡️ **Defense in depth** | 8 security layers (identity, DLP, supply chain, anomaly detection) |
| 📜 **Compliance ready** | EU AI Act & UK AI Governance mapping built-in |
| 🔌 **Framework integrations** | Works with LangChain, CrewAI, Cursor, Claude Code |
| 🎯 **Policy as code** | JSON policies versioned in Git with HMAC signatures |
| 🚨 **Kill switch** | Emergency stop for individual agents or entire fleet |
| 📊 **SIEM integration** | Export to Splunk, Elastic, QRadar (CEF/LEEF/JSON) |
| 🔍 **Anomaly detection** | Guardian agents auto-kill suspicious behavior |

---

## How It Works

![Workflow](workflow.png)

**[See detailed architecture →](./docs/architecture.md)**

---

## Packages

Install only what you need:

| Package | Purpose | Install |
|---------|---------|---------|
| **core** | Policy engine, audit log, kill switch, rate limiter | `@agent-security/core` |
| **identity** | Agent/tool registration, trust evaluation | `@agent-security/identity` |
| **egress** | Data loss prevention, 8 built-in classifiers | `@agent-security/egress` |
| **supply-chain** | Tool provenance, MCP scanning, command governance | `@agent-security/supply-chain` |
| **guardian** | Anomaly detection, auto-kill, incident response | `@agent-security/guardian` |
| **posture** | Risk scoring, compliance reports, SIEM formatting | `@agent-security/posture` |
| **containment** | Sandbox enforcement, change control (Jira/Linear) | `@agent-security/containment` |
| **adapters** | Framework integrations (LangChain, CrewAI, etc.) | `@agent-security/adapters` |

**[📦 Full package documentation →](./docs/packages.md)**

---

## Run the Demos
```bash
git clone https://github.com/mlnas/agent-runtime-security
cd agent-runtime-security
npm install
npm run demo:full-spm  # Runs complete integration demo
```

**Other demos:**
- `npm run demo:identity` - Agent identity & authorization
- `npm run demo:egress` - Data loss prevention
- `npm run demo:supply-chain` - Tool provenance & MCP scanning
- `npm run demo:guardian` - Anomaly detection & auto-kill

---

## Use Cases

| Industry | Challenge | Agent-SPM Solution |
|----------|-----------|-------------------|
| **Fintech** | Prevent data exfiltration, meet regulations | DLP + EU AI Act compliance reports |
| **Healthcare** | HIPAA compliance for agent actions | Audit trail + approval workflows |
| **E-commerce** | PCI compliance for payment agents | Secrets detection + policy enforcement |
| **SaaS** | Protect users from coding agent mistakes | Sandbox + supply chain verification |

---

## Policy Example
```json
{
  "version": "1.0.0",
  "rules": [
    {
      "id": "BLOCK_BULK_EXPORT",
      "description": "Prevent mass data export",
      "match": {
        "tool_name": "query_database",
        "environment": "prod"
      },
      "when": {
        "contains_any": ["SELECT *", "LIMIT 10000"]
      },
      "outcome": "DENY"
    },
    {
      "id": "REQUIRE_APPROVAL_PAYMENT",
      "description": "Payments need manager approval",
      "match": {
        "tool_name": "trigger_payment",
        "environment": "prod"
      },
      "outcome": "REQUIRE_APPROVAL",
      "approver_role": "finance_manager"
    }
  ],
  "defaults": {
    "outcome": "ALLOW"
  }
}
```

**[📖 Policy authoring guide →](./docs/policies.md)**

---

## Documentation

- **[Quickstart](./QUICKSTART.md)** - Get started in 5 minutes
- **[Architecture](./docs/architecture.md)** - System design & security model
- **[Packages](./docs/packages.md)** - API reference for all packages
- **[Policies](./docs/policies.md)** - How to write security policies
- **[Compliance](./docs/compliance.md)** - EU AI Act & UK AI Governance map
- **[Security](./SECURITY.md)** - Security properties & threat model
- **[Examples](./examples/)** - Integration examples & demos

---

## Community & Support

- 📖 [Documentation](./docs/)
- 💬 [GitHub Discussions](https://github.com/mlnas/agent-runtime-security/discussions)
- 🐛 [Issue Tracker](https://github.com/mlnas/agent-runtime-security/issues)
- 🤝 [Contributing Guide](./CONTRIBUTING.md)

---

## Roadmap

- [x] Core policy engine with 6 decision outcomes
- [x] Identity & trust management
- [x] DLP with 8 built-in classifiers
- [x] Supply chain security (MCP scanning, provenance)
- [x] Guardian anomaly detection
- [x] EU AI Act & UK AI Governance compliance
- [ ] Visual policy builder (Q2 2025)
- [ ] ML-based behavior learning (Q3 2025)
- [ ] Community policy library (Q2 2025)
- [ ] Integration marketplace (Q4 2025)

**[Vote on features →](https://github.com/mlnas/agent-runtime-security/discussions)**

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Citation

If you use Agent-SPM in academic work, please cite:
```bibtex
@software{agent_spm_2025,
  title = {Agent-SPM: Security Posture Management for AI Agents},
  author = {Your Name},
  year = {2025},
  url = {https://github.com/mlnas/agent-runtime-security}
}
```

---

**Built with ❤️ for the AI agent community**
