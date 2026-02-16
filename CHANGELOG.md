# Changelog

All notable changes to the Agent-SPM platform.

---

## [0.3.0] — 2026-01-29

### Added

**Identity & Authorization**
- `@agent-security/identity` package: `AgentRegistry`, `ToolRegistry`, `TrustEvaluator`, `identityEnforcer` plugin
- `AgentTrustLevel` hierarchy: untrusted → basic → verified → privileged → system
- `AgentType` classification: ide_agent, pr_agent, chat_agent, workflow_agent, autonomous_agent
- `AgentAttestation` for cryptographic identity proof
- `ToolIdentity` with provider, manifest hash, permissions, verification status
- Identity-aware policy matching: `agent_type`, `trust_level_min`, `agent_roles_any`, `tool_provider`

**Data Loss Prevention**
- `@agent-security/egress` package: `egressEnforcer`, `DestinationPolicyEngine`, `ComplianceReporter`
- 8 built-in classifiers: PII (SSN, email, phone), PCI (card numbers), SECRET (API keys, private keys, AWS keys, generic)
- 8 egress channels: http_request, file_write, db_query, email, clipboard, ci_artifact, mcp_response, terminal_output
- Custom classifier support via `createCustomClassifier()`

**Supply Chain Security**
- `@agent-security/supply-chain` package: `McpScanner`, `ToolProvenance`, `CommandGovernor`, `supplyChainGuard` plugin
- MCP server manifest scanning with risk scoring (0-100)
- SHA-256 tool provenance verification
- Pattern-based command governance (allow/block/require_approval)

**Guardian Agents**
- `@agent-security/guardian` package: `GuardianAgent` with anomaly detection
- Anomaly types: frequency_spike, volume_spike, suspicious_sequence, off_hours
- Auto-kill on threshold breach
- 3 pre-built blueprints: BLUEPRINT_ENGINEERING, BLUEPRINT_FINANCE, BLUEPRINT_SOC

**Posture Management**
- `@agent-security/posture` package: `PostureInventory`, `RiskScorer`, `ComplianceMapper`, `SocFormatter`, `AuditExporter`
- Fleet risk scoring (0-100 scale with critical/high/medium/low levels)
- EU AI Act compliance mapping (7 controls)
- UK AI Governance compliance mapping (5 controls)
- SIEM event formatting: CEF, LEEF, structured JSON
- Audit export: JSON and CSV

**Containment**
- `@agent-security/containment` package: `SandboxManager`, `ChangeControl`, `containmentPlugin`
- Sandbox types: process, container, wasm, none
- Change control integration: Jira, Linear, GitHub, custom providers

**Framework Adapters**
- `@agent-security/adapters` package: Cursor MCP, Claude Code, LangChain, CrewAI

**Decision Outcomes**
- 3 new outcomes: `STEP_UP`, `REQUIRE_TICKET`, `REQUIRE_HUMAN`
- Corresponding callbacks: `onStepUpRequired`, `onTicketRequired`, `onHumanRequired`

**Integration Demos**
- `examples/01-identity-authz/` — Identity and authorization demo
- `examples/02-egress-dlp/` — Egress control and DLP demo
- `examples/03-supply-chain/` — Supply chain security demo
- `examples/04-guardian-posture/` — Guardian and posture demo
- `examples/05-full-spm/` — Full platform integration demo

### Changed
- Schemas updated to v0.3 with identity-aware fields
- `AgentActionRequest.agent` block expanded with trust, roles, capabilities, attestation
- `AgentActionRequest.context` expanded with delegation_chain, parent_agent_id
- `EventOutcome` expanded to 11 values (added KILL_SWITCH, RATE_LIMITED, TIMEOUT)
- `CheckToolCallParams` expanded with identity-aware fields
- Monorepo structure with npm workspaces

---

## [0.2.0] — 2026-01-20

### Added
- Plugin architecture with 5-phase lifecycle pipeline
- Built-in plugins: kill switch, rate limiter, session context, output validator
- `protect()` function wrapper with afterExecution hook
- Advanced policy matching: array tool names, glob prefixes, `not_contains`, `matches_regex`, `tool_args_match`
- Numeric comparison operators: gt, gte, lt, lte, eq, neq
- Flexible environments (any string, not just dev/staging/prod)
- Extensible context with `[key: string]: any`
- Async policy loading with `policyLoader` and `init()`
- Configurable approval timeout (`approvalTimeoutMs`)
- HMAC-SHA256 policy signature verification
- Path traversal prevention in policy file loading
- ReDoS-safe regex validation
- AsyncMutex for TOCTOU prevention
- Bounded audit log with FIFO eviction
- Plugin source attribution in audit events

### Changed
- Schemas updated to v0.2
- Open-source SDK transform (removed proprietary dependencies)

---

## [0.1.0] — 2026-01-15

### Added
- Core policy engine with first-match rule evaluation
- `AgentActionRequest`, `Decision`, `Event`, `PolicyBundle`, `PolicyRule` schemas
- Policy loading from file and JSON string
- `contains_any` and `data_labels_any` when conditions
- 3 decision outcomes: ALLOW, DENY, REQUIRE_APPROVAL
- In-memory audit log
- Callbacks: onAllow, onDeny, onApprovalRequired, onAuditEvent
- `checkToolCall()` API
- Policy validation and expiration checking
- Basic demo with 9 scenarios
