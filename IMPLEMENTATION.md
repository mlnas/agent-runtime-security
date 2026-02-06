# Implementation Summary

## Overview

Open-source SDK providing runtime security policies for AI agents. Ships with a plugin architecture for extensibility and a set of built-in plugins for common enterprise needs. No gateway, no infrastructure — just `npm install` and integrate.

## What Was Built

### Core SDK (`/core`)

**Purpose**: Lightweight, in-process security layer with plugin pipeline.

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
   - Validates structure, version, and expiration
   - Public `validate()` method

3. **evaluator.ts** — Policy evaluation engine (v0.2)
   - First-match rule processing
   - Tool name matching: exact string, arrays, glob prefixes (`query_*`)
   - Environment matching: any string or wildcard
   - `when` conditions: `contains_any`, `not_contains`, `matches_regex`, `data_labels_any`, `tool_args_match`
   - Numeric comparisons: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`
   - Constraints passthrough to decisions

4. **events.ts** — Audit event generation
   - UUID-based event IDs (`uuidv4`)
   - Plugin source attribution
   - Data redaction

5. **sdk.ts** — Main SDK client with plugin pipeline
   - `AgentSecurity` class — Primary API
   - 5-phase lifecycle: beforeCheck → evaluate → afterDecision → callbacks → afterExecution
   - `checkToolCall()` — Policy check method
   - `protect()` — Function wrapper with output validation
   - `init()` — Async initialization for remote policy loading
   - `registerPlugin()` / `unregisterPlugin()` / `getPlugin()` — Runtime plugin management
   - `approvalTimeoutMs` — Configurable approval timeout
   - `onError` — Error callback for plugin/callback failures
   - `shutdown()` — Graceful cleanup calling `destroy()` on all plugins

### Built-in Plugins (`/core/src/plugins`)

6. **kill-switch.ts** — Emergency agent disable
   - `kill(agentId, reason?)` — Disable a specific agent
   - `revive(agentId)` — Re-enable a specific agent
   - `killAll(reason?)` / `reviveAll()` — Global toggle
   - `isKilled(agentId)` — Query status
   - Short-circuits in `beforeCheck` with DENY

7. **rate-limiter.ts** — Per-agent, per-tool rate limiting
   - `maxPerMinute` — Global per-agent limit
   - `maxPerMinutePerTool` — Per-tool limit
   - Sliding window implementation
   - Short-circuits in `beforeCheck` with DENY

8. **session-context.ts** — Cross-call session tracking
   - Per-tool `maxPerSession` limits
   - Configurable session TTL (`sessionTtlMs`)
   - Automatic session cleanup
   - Session ID from `request.context.session_id`

9. **output-validator.ts** — Post-execution output scanning
   - Regex-based sensitive data detection
   - Forbidden keyword scanning
   - Max output length enforcement
   - Callback on detection (`onSensitiveData`)

### Demos

**demo.ts** — 9 scenarios demonstrating:
- Policy decisions (ALLOW, DENY, REQUIRE_APPROVAL)
- Kill switch block
- Rate limiter block
- Session context limits
- Advanced rule matching (regex, numeric, multi-tool)
- Approval timeout
- Audit trail with plugin attribution

**test-demo.ts** — 5 scenarios for quick verification:
- ALLOW, DENY, kill switch, rate limiter, REQUIRE_APPROVAL

### Examples (`/examples`)

- **basic-usage.ts** — Minimal integration
- **custom-approval.ts** — Approval workflow with timeout
- **protect-wrapper.ts** — Function wrapping pattern
- **plugins-demo.ts** — All four built-in plugins

### Default Policy Bundle

`default-policy.json` implements:

1. **Data Protection** — Block bulk exports, block PCI/PII transmission
2. **Financial Controls** — Require approval for payments and refunds
3. **Production Safety** — Require approval for prod emails, allow dev/staging
4. **Default Behavior** — ALLOW for unmatched rules

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

### 3. Callback-Based Approvals with Timeouts

**Decision**: Custom callbacks with configurable timeout.

**Rationale**:
- Enterprises have existing approval systems (Slack, ServiceNow, etc.)
- SDK shouldn't dictate approval UX
- Timeout prevents hangs from unresponsive callbacks

### 4. Flexible Schemas (v0.2)

**Decision**: Use `string` instead of enum for environments and action types.

**Rationale**:
- Enterprises have custom environments (sandbox, preview, local, etc.)
- Action types extend beyond tool calls (memory_access, web_browse, code_execute)
- Extensible context with `[key: string]: any`
- No schema changes needed for new use cases

### 5. First-Match Rule Processing

**Decision**: Rules evaluated in order, first match wins.

**Rationale**:
- Predictable behavior
- Standard firewall pattern
- Easy to reason about precedence
- More specific rules go first

### 6. In-Memory Audit Log with Plugin Attribution

**Decision**: Store events in memory with plugin source tracking, provide callbacks for export.

**Rationale**:
- SDK shouldn't dictate storage
- `plugin_source` field shows which plugin made each decision
- `onAuditEvent` callback for real-time export
- `getAuditLog()` for testing/debugging

## Testing the System

### Run Demos

```bash
# Full demo (9 scenarios with plugins)
npm run demo

# Quick demo (5 scenarios)
npm run demo:quick
```

### Run Examples

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

## Integration Points

Enterprises integrate at these points:

1. **Initialization** — Configure SDK with policy + plugins
2. **Tool Execution** — Call `checkToolCall()` or use `protect()`
3. **Approval Workflow** — Implement `onApprovalRequired` callback
4. **Audit System** — Implement `onAuditEvent` callback
5. **Emergency Controls** — Use kill switch plugin for instant shutoff
6. **Plugin Extension** — Write custom plugins for org-specific logic

## Production Considerations

### Security
- Version-control policies in Git
- Use async policy loading for centralized policy management
- Protect approval callbacks
- Layer plugins for defense-in-depth (kill switch + rate limiter + session context)

### Performance
- Policy evaluation: < 1ms
- No network calls in core SDK
- Plugins execute in-memory
- Async only for approvals and remote policy loading

### Monitoring
- Export audit events via `onAuditEvent` to your observability stack
- Track `plugin_source` to see which plugins are triggering
- Monitor kill switch activations
- Alert on rate limit hits

### Deployment
- Include policy JSON with deployment or use remote loader
- Set environment correctly (any string: dev, staging, prod, etc.)
- Configure `approvalTimeoutMs` for production
- Call `shutdown()` on process exit
