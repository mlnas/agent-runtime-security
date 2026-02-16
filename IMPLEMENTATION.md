# Implementation Summary

## Overview

Agent Security Posture Management (Agent-SPM) platform providing runtime security for AI agents. Ships as a monorepo with a core policy engine and 7 specialized security packages. No gateway, no infrastructure — just `npm install` and integrate.

## What Was Built

### Core SDK (`/core`) — `@agent-security/core`

**Purpose**: Lightweight, in-process security layer with a 5-phase plugin pipeline.

**Key Components**:

1. **schemas.ts** — Type definitions (v0.2)
   - `AgentActionRequest` — Flexible action types and environments (any string)
   - `Decision` — Policy evaluation result with optional constraints
   - `Event` — Audit log entry with plugin attribution (`plugin_source`)
   - `PolicyBundle` / `PolicyRule` — Policy configuration with advanced matching
   - `SecurityPlugin` — Plugin interface with lifecycle hooks
   - `BeforeCheckContext`, `AfterDecisionContext`, `AfterExecutionContext` — Plugin context types

2. **loader.ts** — Policy bundle loading and validation
   - Load from file path, JSON string, or object
   - `loadAsync()` — Async loading from custom loader functions
   - HMAC-SHA256 signature verification with constant-time comparison
   - Validates structure, version, and expiration

3. **evaluator.ts** — Policy evaluation engine (v0.2)
   - First-match rule processing
   - Tool name matching: exact string, arrays, glob prefixes (`query_*`)
   - Environment matching: any string or wildcard
   - Identity-aware matching: `agent_type`, `trust_level_min`, `agent_roles_any`, `tool_provider`
   - `when` conditions: `contains_any`, `not_contains`, `matches_regex`, `data_labels_any`, `tool_args_match`
   - Numeric comparisons: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`
   - Constraints passthrough to decisions

4. **events.ts** — Audit event generation
   - UUID-based event IDs
   - Plugin source attribution
   - Data redaction

5. **sdk.ts** — Main platform client with plugin pipeline
   - `AgentSecurity` class — Primary API
   - 5-phase lifecycle: beforeCheck → evaluate → afterDecision → callbacks → afterExecution
   - `checkToolCall()` — Policy check method
   - `protect()` — Function wrapper with output validation
   - `init()` — Async initialization for remote policy loading
   - `registerPlugin()` / `unregisterPlugin()` / `getPlugin()` — Runtime plugin management
   - `approvalTimeoutMs` — Configurable approval timeout
   - 6 decision outcomes: ALLOW, DENY, REQUIRE_APPROVAL, STEP_UP, REQUIRE_TICKET, REQUIRE_HUMAN
   - AsyncMutex for TOCTOU prevention in concurrent requests
   - `shutdown()` — Graceful cleanup calling `destroy()` on all plugins

### Built-in Plugins (`/core/src/plugins`)

6. **kill-switch.ts** — Emergency agent disable
   - `kill(agentId, reason?)` / `revive(agentId)` / `killAll()` / `reviveAll()`
   - Short-circuits in `beforeCheck` with DENY

7. **rate-limiter.ts** — Per-agent, per-tool rate limiting
   - `maxPerMinute` / `maxPerMinutePerTool` — Sliding window implementation

8. **session-context.ts** — Cross-call session tracking
   - Per-tool `maxPerSession` limits with configurable TTL

9. **output-validator.ts** — Post-execution output scanning
   - Regex-based sensitive data detection, forbidden keywords, max output length

### Identity Package (`/packages/identity`) — `@agent-security/identity`

**Purpose**: Agent and tool identity management with trust-based access control.

- **AgentRegistry** — Register, lookup, revoke, and query agents by type or trust level
- **ToolRegistry** — Register tools with SHA-256 manifest verification
- **TrustEvaluator** — Compute effective trust levels using contextual factors (environment, delegation depth, time of day, consecutive denials)
- **identityEnforcer** — Plugin enforcing registration, trust thresholds, and delegation depth limits in `beforeCheck`

### Egress Package (`/packages/egress`) — `@agent-security/egress`

**Purpose**: Data loss prevention and egress channel enforcement.

- **egressEnforcer** — Plugin scanning tool arguments for PII/PCI/secrets and enforcing destination policies
- **Built-in classifiers** — SSN, email, phone, credit card, API keys, AWS keys, private keys, generic secrets
- **DestinationPolicyEngine** — Evaluate egress rules per classification and channel
- **ComplianceReporter** — Generate DLP compliance evidence reports
- **createCustomClassifier** — Factory for custom data classifiers

### Supply Chain Package (`/packages/supply-chain`) — `@agent-security/supply-chain`

**Purpose**: Tool provenance verification, MCP server security scanning, and command governance.

- **McpScanner** — Analyze MCP server manifests for security risks (0-100 risk score)
- **ToolProvenance** — SHA-256 manifest hash registration and runtime verification
- **CommandGovernor** — Pattern-based shell command control (allow/block/require_approval)
- **supplyChainGuard** — Plugin combining provenance, command governance, and MCP blocking

### Guardian Package (`/packages/guardian`) — `@agent-security/guardian`

**Purpose**: Autonomous anomaly detection and incident response.

- **GuardianAgent** — Processes audit events for frequency spikes, volume spikes, suspicious sequences, off-hours activity
- **Auto-kill** — Terminate agents exceeding anomaly thresholds
- **Blueprints** — Pre-built configs for engineering (monitor), finance (block), and SOC (correct + auto-kill) teams
- **Correction modes** — monitor, block, correct

### Posture Package (`/packages/posture`) — `@agent-security/posture`

**Purpose**: Fleet-wide security posture management.

- **PostureInventory** — Centralized asset inventory (agents, tools, plugins, MCP servers)
- **RiskScorer** — Individual and fleet risk assessment (0-100 scale)
- **ComplianceMapper** — EU AI Act and UK AI Governance regulatory mapping
- **SocFormatter** — SIEM event formatting (CEF, LEEF, JSON)
- **AuditExporter** — Export audit logs as JSON or CSV

### Containment Package (`/packages/containment`) — `@agent-security/containment`

**Purpose**: Sandbox enforcement and change control integration.

- **SandboxManager** — Define execution constraints per tool (paths, network, timeout, memory)
- **ChangeControl** — Validate change tickets against external systems (Jira, Linear, GitHub)
- **containmentPlugin** — Plugin checking sandbox constraints and ticket requirements in `beforeCheck`

### Adapters Package (`/packages/adapters`) — `@agent-security/adapters`

**Purpose**: Framework integration for popular AI agent frameworks.

- **createCursorMiddleware** — Cursor IDE MCP middleware
- **createClaudeCodeWrapper** — Claude Code tool wrapper
- **wrapLangChainTool** — LangChain tool decorator
- **createCrewAIGuard** — CrewAI task guard

### Examples (`/examples`)

- **basic-usage.ts** — Minimal core integration
- **custom-approval.ts** — Approval workflow with timeout
- **protect-wrapper.ts** — Function wrapping pattern
- **plugins-demo.ts** — All four built-in core plugins
- **01-identity-authz/** — Identity, trust evaluation, role-based access
- **02-egress-dlp/** — Data classification, egress control, compliance evidence
- **03-supply-chain/** — MCP scanning, provenance, command governance
- **04-guardian-posture/** — Anomaly detection, risk scoring, compliance, SIEM
- **05-full-spm/** — All packages integrated end-to-end (9 scenarios)

## Design Decisions

### 1. SDK Over Gateway

**Decision**: In-process SDK, not separate HTTP service.

**Rationale**:
- Lower latency (no network calls)
- Simpler deployment (no infrastructure)
- Better for open-source adoption
- Enterprise-friendly (runs in their code)

**Trade-offs**:
- No centralized enforcement point (mitigated by remote policy loading)
- Each agent needs SDK integration
- Policy updates require reload (mitigated by `reloadPolicyAsync`)

### 2. Plugin Architecture

**Decision**: Lifecycle hooks instead of monolithic core.

**Rationale**:
- Core stays small and focused (policy evaluation only)
- Features like kill switch and rate limiter are opt-in
- Third parties can write custom plugins
- Each plugin has a single responsibility

**Implementation**: 5-phase pipeline where plugins can short-circuit, modify decisions, or validate output.

### 3. Monorepo with Independent Packages

**Decision**: One repo, 8 npm packages under `@agent-security/*` scope.

**Rationale**:
- Install only what you need — core is ~0 dependencies
- Packages compose at the application level, no inter-package dependencies
- Shared types from core ensure consistency
- Single repo makes cross-package changes atomic

### 4. Callback-Based Approvals with Timeouts

**Decision**: Custom callbacks with configurable timeout.

**Rationale**:
- Enterprises have existing approval systems (Slack, ServiceNow, etc.)
- SDK shouldn't dictate approval UX
- Timeout prevents hangs from unresponsive callbacks

### 5. Flexible Schemas (v0.2)

**Decision**: Use `string` instead of enum for environments and action types.

**Rationale**:
- Enterprises have custom environments (sandbox, preview, local, etc.)
- Action types extend beyond tool calls (memory_access, web_browse, code_execute)
- Extensible context with `[key: string]: any`
- No schema changes needed for new use cases

### 6. First-Match Rule Processing

**Decision**: Rules evaluated in order, first match wins.

**Rationale**:
- Predictable behavior
- Standard firewall pattern
- Easy to reason about precedence
- More specific rules go first

### 7. Fail-Closed by Default

**Decision**: Every component defaults to denial on error.

**Rationale**:
- Plugin errors → DENY (unless `failOpen: true`)
- Missing approval callback → DENY
- Expired policies → rejected
- HMAC verification failure → rejected
- Consistent safety baseline

## Testing the System

### Run Demos

```bash
# Core demos
npm run demo                # Full demo (9 scenarios with plugins)
npm run demo:quick          # Quick demo (5 scenarios)

# Package demos
npm run demo:identity       # Identity & authorization
npm run demo:egress         # DLP & egress control
npm run demo:supply-chain   # Supply chain security
npm run demo:guardian        # Guardian & posture management
npm run demo:full-spm        # All packages end-to-end
```

### Run Standalone Examples

```bash
npx ts-node examples/basic-usage.ts
npx ts-node examples/custom-approval.ts
npx ts-node examples/protect-wrapper.ts
npx ts-node examples/plugins-demo.ts
```

## What's NOT Included (by Design)

- HTTP gateway/server — enterprises embed the SDK directly
- Built-in approval UI — enterprises have their own
- Persistent audit storage — use `onAuditEvent` to export
- Authentication/authorization — handled by the host application
- Policy management UI — separate concern
- Network-level controls — out of scope for an in-process SDK

## Integration Points

Enterprises integrate at these points:

1. **Initialization** — Configure SDK with policy + plugins
2. **Tool Execution** — Call `checkToolCall()` or use `protect()` or framework adapter
3. **Identity** — Register agents and tools, configure trust requirements
4. **Egress Control** — Define classifiers and channel policies
5. **Supply Chain** — Register tool manifests, configure command governance
6. **Approval Workflow** — Implement `onApprovalRequired` / `onTicketRequired` / `onHumanRequired`
7. **Monitoring** — Feed audit events to Guardian and SIEM via `onAuditEvent`
8. **Compliance** — Generate regulatory reports with ComplianceMapper
9. **Emergency Controls** — Use kill switch or Guardian auto-kill for instant shutoff
10. **Plugin Extension** — Write custom plugins for org-specific logic

## Production Considerations

### Security
- Version-control policies in Git
- Sign policy bundles with HMAC-SHA256
- Use async policy loading for centralized policy management
- Require agent registration in production (`requireRegistration: true`)
- Enable DLP classifiers for all external-facing channels
- Layer plugins for defense-in-depth

### Performance
- Policy evaluation: < 1ms
- No network calls in core SDK
- Plugins execute in-memory
- Async only for approvals and remote policy loading
- AsyncMutex serializes concurrent checks to prevent race conditions

### Monitoring
- Export audit events via `onAuditEvent` to your observability stack
- Feed events to Guardian for real-time anomaly detection
- Format events with SocFormatter for SIEM ingestion (CEF/LEEF/JSON)
- Track `plugin_source` to see which plugins are triggering
- Monitor kill switch activations and rate limit hits

### Deployment
- Include policy JSON with deployment or use remote loader
- Set environment correctly (any string: dev, staging, prod, etc.)
- Configure `approvalTimeoutMs` for production
- Call `shutdown()` on process exit
