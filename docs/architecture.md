# Architecture

## Overview

The Agent Runtime Security SDK is a **lightweight, in-process security layer** that enterprises can integrate directly into their AI agent systems. There is no gateway, no separate service, and no infrastructure to manage.

## Design Philosophy

### 1. **Zero Infrastructure**
The SDK runs in the same process as your agent code. No HTTP calls, no network latency, no deployment complexity.

### 2. **Policy as Code**
Security policies are JSON files that live in your codebase, version controlled with Git, and deployed with your application.

### 3. **Integration First**
Designed to wrap around existing tool functions with minimal code changes. Works with any agent framework.

### 4. **Extensible Callbacks**
Custom approval workflows, audit logging, and alerting are all handled via callbacks you implement.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Agent Code                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              AgentSecurity SDK                        │  │
│  │                                                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │  │
│  │  │Policy Loader │→ │  Evaluator   │→ │  Events   │  │  │
│  │  └──────────────┘  └──────────────┘  └───────────┘  │  │
│  │         ↓                  ↓                ↓        │  │
│  │    Policy JSON        Decision         Audit Log    │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                │
│                    Your Callbacks                           │
│          ┌──────────────────┬──────────────────┐           │
│          ↓                  ↓                  ↓            │
│   onApprovalRequired   onDeny/onAllow   onAuditEvent       │
│          ↓                                     ↓            │
│   Slack/Email/Custom                   Your Audit System   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Policy Loader

**Location**: `core/src/loader.ts`

**Responsibilities:**
- Load policy bundles from file or JSON string
- Validate policy structure (version, rules, expiration)
- Check policy expiration dates

**Usage:**
```typescript
const bundle = PolicyBundleLoader.loadFromFile('./policy.json');
```

### 2. Policy Evaluator

**Location**: `core/src/evaluator.ts`

**Responsibilities:**
- Match incoming requests against policy rules
- Evaluate `when` conditions (keywords, data labels)
- Return decision (ALLOW/DENY/REQUIRE_APPROVAL)
- First-match rule processing with default fallback

**How it works:**
1. Iterate through rules in order
2. Check if tool name matches
3. Check if environment matches
4. Check optional `when` conditions
5. Return first matching rule's outcome
6. If no match, return default policy

### 3. Event Generator

**Location**: `core/src/events.ts`

**Responsibilities:**
- Create audit events from requests and decisions
- Redact sensitive data from payloads
- Generate event IDs and timestamps

### 4. SDK Client

**Location**: `core/src/sdk.ts`

**Responsibilities:**
- Main API surface for developers
- Orchestrate policy loading and evaluation
- Handle callbacks for approvals/denials
- Manage in-memory audit log
- Provide convenience wrappers (`protect()`)

## Data Flow

### Simple Tool Call Check

```
1. Developer calls security.checkToolCall()
   ↓
2. SDK constructs AgentActionRequest
   ↓
3. Evaluator matches against policy rules
   ↓
4. Decision returned (ALLOW/DENY/REQUIRE_APPROVAL)
   ↓
5. SDK creates audit event
   ↓
6. SDK invokes appropriate callback (onAllow/onDeny/onApprovalRequired)
   ↓
7. For REQUIRE_APPROVAL: SDK awaits approval callback response
   ↓
8. SDK returns SecurityCheckResult with allowed=true/false
   ↓
9. Developer proceeds or blocks based on result
```

### Using protect() Wrapper

```
1. Developer wraps function with security.protect()
   ↓
2. Wrapped function is returned
   ↓
3. When wrapped function is called:
   a. SDK automatically calls checkToolCall()
   b. If allowed=false, throws SecurityError
   c. If allowed=true, executes original function
   ↓
4. Result returned to caller
```

## Decision Types

### ALLOW
- Action is permitted
- Tool executes immediately
- `onAllow` callback invoked
- Audit event logged

### DENY
- Action is blocked
- Tool never executes
- `onDeny` callback invoked
- Audit event logged

### REQUIRE_APPROVAL
- Action requires human approval
- `onApprovalRequired` callback invoked
- Callback returns true/false
- If approved: tool executes (like ALLOW)
- If rejected: tool blocked (like DENY)
- Both request and approval decision logged

## Policy Structure

### Policy Bundle
```json
{
  "version": "0.1.0",
  "generated_at": "ISO-8601 timestamp",
  "expires_at": "ISO-8601 timestamp",
  "rules": [ /* array of rules */ ],
  "defaults": {
    "outcome": "ALLOW" | "DENY"
  },
  "signature": "optional digital signature"
}
```

### Policy Rule
```json
{
  "id": "UNIQUE_RULE_ID",
  "description": "Human-readable explanation",
  "match": {
    "tool_name": "specific_tool" | "*",
    "environment": "dev" | "staging" | "prod" | "*"
  },
  "when": {
    "contains_any": ["keyword1", "keyword2"],
    "data_labels_any": ["PII", "PCI"]
  },
  "outcome": "ALLOW" | "DENY" | "REQUIRE_APPROVAL",
  "approver_role": "optional role for approvals"
}
```

## Integration Patterns

### Pattern 1: Direct Check

Most explicit, full control:

```typescript
const result = await security.checkToolCall({
  toolName: 'send_email',
  toolArgs: { to: 'user@example.com' },
  agentId: 'my-agent',
  environment: 'prod'
});

if (result.allowed) {
  await emailService.send(...);
}
```

### Pattern 2: Protect Wrapper

Most convenient, decorative:

```typescript
const sendEmail = security.protect(
  'send_email',
  emailService.send,
  { agentId: 'my-agent', environment: 'prod' }
);

await sendEmail('user@example.com', 'Hello');
```

### Pattern 3: Framework Integration

Integrate with agent frameworks:

```typescript
class SecureLangChainTool extends Tool {
  async _call(input: string) {
    const result = await security.checkToolCall({
      toolName: this.name,
      toolArgs: { input },
      agentId: this.agentId
    });
    
    if (!result.allowed) {
      throw new SecurityError(result.decision.reasons[0].message);
    }
    
    return await this.execute(input);
  }
}
```

## Callbacks and Extension Points

### onApprovalRequired
```typescript
async (request: AgentActionRequest, decision: Decision) => Promise<boolean>
```

Called when a rule returns REQUIRE_APPROVAL. Implement your approval workflow here:
- Send Slack message with approve/deny buttons
- Create ticket in approval system
- Email manager with approval link
- Pop up UI dialog
- Always return true (approve) or false (deny)

### onDeny
```typescript
(request: AgentActionRequest, decision: Decision) => void
```

Called when action is denied. Use for:
- Alerting security team
- Logging to SIEM
- Notifying agent owner
- Incrementing metrics

### onAllow
```typescript
(request: AgentActionRequest, decision: Decision) => void
```

Called when action is allowed. Use for:
- Incrementing metrics
- Debug logging
- Tracking agent behavior

### onAuditEvent
```typescript
(event: Event) => void
```

Called for every decision and approval. Use for:
- Sending to audit log storage (S3, CloudWatch, etc.)
- Streaming to SIEM
- Compliance reporting
- Real-time monitoring

## Audit Trail

Every decision generates an Event:

```typescript
{
  event_id: "uuid",
  timestamp: "ISO-8601",
  request_id: "original request uuid",
  agent_id: "agent-001",
  tool_name: "send_email",
  outcome: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "APPROVED" | "REJECTED",
  reasons: [
    {
      code: "RULE_ID",
      message: "Human explanation"
    }
  ],
  safe_payload: {
    // Redacted request data
  }
}
```

Events are:
- Stored in-memory by default (call `getAuditLog()`)
- Sent to `onAuditEvent` callback
- Can be persisted to your audit system
- Contain redacted/safe payloads only

## Security Considerations

### Policy Bundle Integrity
- Policies can be digitally signed (signature field)
- Expiration dates prevent stale policies
- Version field tracks policy evolution

### Sensitive Data Handling
- Tool arguments may contain PII/secrets
- Events use `safe_payload` with redaction
- User input is optional, can be omitted
- Data labels let you mark sensitive data explicitly

### Performance
- In-process execution (no network calls)
- Simple rule matching (no regex by default)
- First-match evaluation (O(n) rules)
- Synchronous evaluation (microsecond latency)

## Extension Opportunities

### Custom Rule Matchers
Extend PolicyEvaluator to support:
- Regex patterns
- JSON path queries
- Custom predicates

### Policy Management
Build tools for:
- Policy validation
- Policy testing
- Policy visualization
- Conflict detection

### Integration Packages
Create adapters for:
- LangChain
- CrewAI
- AutoGPT
- Semantic Kernel
- Other agent frameworks

## Non-Goals

This SDK intentionally does NOT:
- Run as a separate service/gateway
- Require infrastructure deployment
- Implement distributed approval workflows
- Provide policy management UI (separate tool)
- Include authentication/authorization
- Enforce network-level controls
- Replace application security best practices

The SDK is **one layer** of defense for AI agents, focused on runtime policy enforcement at the code level.
