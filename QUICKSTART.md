# Agent Runtime Security - Quick Start Guide

This is a demo MVP of an Agentic AI Runtime Security Layer that enforces runtime policies for AI agent tool calls.

## Architecture

- **core**: Shared policy evaluation engine (no HTTP, no databases, no UI)
- **gateway**: HTTP enforcement runtime that intercepts tool calls and enforces decisions
- **default-policy.json**: Default policy bundle with sensible security rules

## Quick Start

### 1. Install Dependencies

```bash
npm run install:all
```

This will install dependencies for:
- Root project (demo script dependencies)
- Core engine
- Gateway server

### 2. Build TypeScript

```bash
npm run build:all
```

This compiles the TypeScript code for both core and gateway.

### 3. Start the Gateway Server

In one terminal:

```bash
npm run start:gateway
```

The gateway will start on `http://localhost:3000` and load the default policy bundle.

### 4. Run the Demo

In another terminal:

```bash
npm run demo
```

This will run a series of test scenarios demonstrating:
- ✅ **ALLOW**: Safe actions in dev/staging environments
- ❌ **DENY**: Blocked bulk exports and PCI data transmission
- ⏳ **REQUIRE_APPROVAL**: Financial operations and production emails requiring approval
- 📋 **Approval workflow**: Approving/rejecting pending requests
- 📊 **Audit log**: Viewing all security events

## Demo Scenarios

The demo script tests 8 scenarios to demonstrate all three policy decision types:

**Scenario 1: ALLOW - Safe Dev Action**
- Queries database in dev environment
- Result: Allowed by default policy (200)

**Scenario 2: DENY - Bulk Export Attempt**
- Tries to export all customers from production database
- Matches `DENY_BULK_EXPORT` rule (contains "export" keyword)
- Result: Blocked (403)

**Scenario 3: REQUIRE_APPROVAL - Production Email**
- Sends email in production environment
- Matches `REQUIRE_APPROVAL_EMAIL_PROD` rule
- Result: Approval required (202)

**Scenario 4: REQUIRE_APPROVAL - Production Payment**
- Triggers payment in production environment
- Matches `REQUIRE_APPROVAL_PAYMENT_PROD` rule
- Result: Approval required (202)

**Scenario 5: REQUIRE_APPROVAL - Another Production Email**
- Creates another pending approval for demonstration

**Scenario 6: List Pending Approvals**
- Fetches all approval requests with status PENDING
- Shows approval_id, tool_name, agent_id, created_at

**Scenario 7: Approve Payment**
- Approves the payment from Scenario 4
- Tool executes (mocked) and returns result
- Logs APPROVED and ALLOW events

**Scenario 8: Reject Email**
- Rejects the email from Scenario 5
- Tool does not execute
- Logs REJECTED event

After running, check `gateway/logs/events.jsonl` to see the complete audit trail.

## API Endpoints

### Tool Call Interception
```
POST /tool-call
Body: AgentActionRequest (see docs/schemas.md)
```

### Approvals
```
GET  /approvals
POST /approvals/:approval_id/approve
POST /approvals/:approval_id/reject
```

## Default Policy Rules

The default policy bundle includes:

1. **DENY** bulk export attempts from customer database
2. **DENY** sending PCI/PII data via email
3. **REQUIRE_APPROVAL** for financial operations (payments, refunds) in production
4. **REQUIRE_APPROVAL** for sending emails in production
5. **ALLOW** all actions in dev/staging environments by default

## Testing Custom Scenarios

You can create custom AgentActionRequest payloads and send them to the gateway:

```bash
curl -X POST http://localhost:3000/tool-call \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-123",
    "timestamp": "2026-01-21T10:00:00.000Z",
    "agent": {
      "agent_id": "my-agent",
      "name": "MyAgent",
      "owner": "dev@example.com",
      "environment": "prod"
    },
    "action": {
      "type": "tool_call",
      "tool_name": "query_database",
      "tool_args": {"query": "SELECT * FROM users"}
    },
    "context": {}
  }'
```

## Audit Logs

Audit logs are written to `gateway/logs/` in JSONL format (append-only).

Each event includes:
- Event ID and timestamp
- Request ID and agent ID
- Tool name and outcome (ALLOW/DENY/REQUIRE_APPROVAL/APPROVED/REJECTED)
- Reasons for the decision
- Redacted payload (safe for audit)

## Customizing Policies

Edit `default-policy.json` to add or modify rules. Each rule can:

- **Match** on tool name and environment
- **Filter** on text content (contains_any) or data labels (data_labels_any)
- **Decide** ALLOW, DENY, or REQUIRE_APPROVAL
- **Specify** an approver role for approval workflows

After editing, restart the gateway to load the new policy.

## Next Steps

For production deployment, consider:
- Multi-tenant authentication
- Policy bundle signing and verification
- Distributed audit log storage
- Advanced approval workflows (Slack integration, etc.)
- RBAC and SSO integration

See `docs/` for detailed architecture and schemas.
