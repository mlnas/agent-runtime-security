# Project Structure

```
agent-runtime-security/
│
├── README.md                       # Platform overview and quick start
├── QUICKSTART.md                   # Getting started guide (core + packages)
├── IMPLEMENTATION.md               # Implementation details and design decisions
├── PROJECT_STRUCTURE.md            # This file
├── CHANGELOG.md                    # Version history
├── SECURITY.md                     # Security properties and threat model
├── LICENSE                         # MIT license
├── package.json                    # Root workspace config (scripts, workspaces)
├── tsconfig.json                   # Root TypeScript config
├── demo.ts                         # Full demo (9 core scenarios)
├── test-demo.ts                    # Quick demo (5 core scenarios)
├── default-policy.json             # Example policy bundle
│
├── core/                           # @agent-security/core
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                # Public exports
│       ├── sdk.ts                  # AgentSecurity class + 5-phase plugin pipeline
│       ├── schemas.ts              # Type definitions (v0.2)
│       ├── evaluator.ts            # Policy evaluation engine (first-match)
│       ├── loader.ts               # Policy loader (file, JSON, async, HMAC)
│       ├── events.ts               # Audit event generator
│       ├── default-policy.ts       # Default policy factory
│       └── plugins/                # Built-in plugins
│           ├── index.ts
│           ├── kill-switch.ts      # Emergency agent disable
│           ├── rate-limiter.ts     # Per-agent/per-tool rate limiting
│           ├── session-context.ts  # Cross-call session tracking
│           └── output-validator.ts # Post-execution output scanning
│
├── packages/
│   ├── identity/                   # @agent-security/identity
│   │   └── src/                    # AgentRegistry, ToolRegistry, TrustEvaluator, identityEnforcer
│   │
│   ├── egress/                     # @agent-security/egress
│   │   └── src/                    # egressEnforcer, DLP classifiers, ComplianceReporter
│   │
│   ├── supply-chain/               # @agent-security/supply-chain
│   │   └── src/                    # McpScanner, ToolProvenance, CommandGovernor, supplyChainGuard
│   │
│   ├── guardian/                   # @agent-security/guardian
│   │   └── src/                    # GuardianAgent, blueprints (engineering, finance, SOC)
│   │
│   ├── posture/                    # @agent-security/posture
│   │   └── src/                    # PostureInventory, RiskScorer, ComplianceMapper, SocFormatter
│   │
│   ├── containment/                # @agent-security/containment
│   │   └── src/                    # SandboxManager, ChangeControl, containmentPlugin
│   │
│   └── adapters/                   # @agent-security/adapters
│       └── src/                    # Cursor, Claude Code, LangChain, CrewAI adapters
│
├── examples/
│   ├── README.md                   # Examples guide with learning progression
│   ├── basic-usage.ts              # Minimal core integration
│   ├── custom-approval.ts          # Approval workflow with timeout
│   ├── protect-wrapper.ts          # Function wrapping with protect()
│   ├── plugins-demo.ts             # All four built-in core plugins
│   ├── 01-identity-authz/          # Identity & trust-based access control
│   ├── 02-egress-dlp/              # Data classification & egress enforcement
│   ├── 03-supply-chain/            # MCP scanning, provenance, command governance
│   ├── 04-guardian-posture/        # Anomaly detection, risk scoring, compliance
│   └── 05-full-spm/               # All packages integrated end-to-end
│
└── docs/
    ├── architecture.md             # System architecture, pipeline, threat model
    ├── schemas.md                  # Schema specification (v0.2)
    ├── policies.md                 # Policy authoring guide
    ├── packages.md                 # Full package API reference
    └── compliance.md               # EU AI Act and UK AI Governance mapping
```

## Package Overview

| Package | npm Scope | Security Domain |
|---------|-----------|-----------------|
| core | `@agent-security/core` | Policy engine, plugin pipeline, audit logging |
| identity | `@agent-security/identity` | Agent/tool registration, trust evaluation |
| egress | `@agent-security/egress` | Data loss prevention, egress channel control |
| supply-chain | `@agent-security/supply-chain` | MCP scanning, tool provenance, command governance |
| guardian | `@agent-security/guardian` | Anomaly detection, auto-kill, incident response |
| posture | `@agent-security/posture` | Inventory, risk scoring, compliance mapping, SIEM |
| containment | `@agent-security/containment` | Sandbox enforcement, change control |
| adapters | `@agent-security/adapters` | Framework integration (Cursor, Claude Code, LangChain, CrewAI) |

All packages depend on `@agent-security/core`. Packages do not depend on each other — they compose at the application level.

## Data Flow

```
Your Agent Code (or Framework Adapter)
    ↓
AgentSecurity.checkToolCall()
    ↓
Phase 1: beforeCheck plugins
    ├── Kill switch        → DENY if agent killed
    ├── Rate limiter       → DENY if rate exceeded
    ├── Identity enforcer  → DENY if unregistered / low trust
    ├── Egress enforcer    → DENY if sensitive data in unauthorized channel
    ├── Supply chain guard → DENY if provenance fails / command blocked
    └── Containment plugin → DENY if sandbox violation / missing ticket
    ↓
Phase 2: PolicyEvaluator (first-match rule processing)
    ↓
Phase 3: afterDecision plugins (modify/override)
    ↓
Phase 4: Decision callbacks
    ├── onAllow / onDeny / onApprovalRequired
    ├── onStepUpRequired / onTicketRequired / onHumanRequired
    └── onAuditEvent → Guardian (anomaly detection) + SIEM export
    ↓
Return { allowed, decision, events }

[If using protect() wrapper]:
    ↓
Phase 5: afterExecution plugins (output validator)
    ↓
Return result or throw SecurityError

[External — on-demand]:
    ├── Posture: inventory, risk scoring, compliance reports
    └── Adapters: Cursor MCP, Claude Code, LangChain, CrewAI
```

## Build & Run

```bash
npm install                 # Install all workspace dependencies
npm run build               # Build core + all packages

npm run demo                # Full core demo (9 scenarios)
npm run demo:quick          # Quick core demo (5 scenarios)
npm run demo:identity       # Identity & authorization demo
npm run demo:egress         # DLP & egress control demo
npm run demo:supply-chain   # Supply chain security demo
npm run demo:guardian        # Guardian & posture demo
npm run demo:full-spm        # All packages end-to-end
```
