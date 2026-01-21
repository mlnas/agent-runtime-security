# Agent Runtime Security (Demo MVP)

This repo contains a demo MVP of an Agentic AI Runtime Security Layer:
- **core**: Policy evaluation engine (shared, no HTTP/databases/UI)
- **gateway**: HTTP enforcement runtime that intercepts tool calls
- **default-policy.json**: Security policy bundle with sensible defaults
- Append-only audit events (JSONL format)
- Simple approval workflow via REST API

## Quick Start

**Note:** The gateway must be running before you can run the demo.

```bash
# 1. Install dependencies
npm run install:all

# 2. Build TypeScript
npm run build:all

# 3. Start gateway (in Terminal 1)
npm run start:gateway

# 4. Run demo (in Terminal 2)
npm run demo
# OR for a quick 3-scenario demo:
npx ts-node test-demo.ts
```

See **QUICKSTART.md** for detailed instructions.

## What the Demo Shows

The demo (`npm run demo`) runs **8 test scenarios** that demonstrate the three policy decision types:

### Test Scenarios

**1. ✅ ALLOW - Safe Dev Action**
- Tool: `query_database` in `dev` environment
- Outcome: Allowed by default policy (no specific rule matches)
- Response: `200 allowed=true`

**2. ❌ DENY - Blocked Bulk Export**
- Tool: `query_customer_db` with keyword "export" in user input
- Outcome: Blocked by `DENY_BULK_EXPORT` rule
- Response: `403 allowed=false`
- Why: Prevents bulk data dumps from customer database

**3. ⏳ REQUIRE_APPROVAL - Production Email (PCI Data)**
- Tool: `send_email` in `prod` environment
- Outcome: Requires approval per `REQUIRE_APPROVAL_EMAIL_PROD` rule
- Response: `202 approval_required=true` with `approval_id`
- Why: Sending emails in production requires human oversight

**4. ⏳ REQUIRE_APPROVAL - Production Payment**
- Tool: `trigger_payment` in `prod` environment
- Outcome: Requires approval per `REQUIRE_APPROVAL_PAYMENT_PROD` rule
- Response: `202 approval_required=true` with `approval_id`
- Why: Financial operations need approval before execution

**5. ⏳ REQUIRE_APPROVAL - Production Email (Notification)**
- Another production email requiring approval
- Demonstrates multiple pending approvals

**6. 📋 List Pending Approvals**
- Shows all approval requests with status `PENDING`
- Displays: approval_id, tool_name, agent_id, created_at

**7. ✅ Approve Payment**
- Approves the payment from Test 4
- Writes `APPROVED` event → Executes tool (mocked) → Writes `ALLOW` event
- Response: `200 status=APPROVED` with tool result

**8. ❌ Reject Email**
- Rejects the email from Test 5
- Writes `REJECTED` event
- Response: `403 status=REJECTED` with reason

### What to Observe

**Console Output:**
- Each test shows the request details and policy decision
- Color-coded results: ✅ (allowed), ❌ (denied), ⏳ (approval required)
- Approval workflow demonstrates approve vs reject outcomes

**Audit Log:**
- After running, check `gateway/logs/events.jsonl`
- Each line is a JSON event showing the complete audit trail
- Events include: ALLOW, DENY, REQUIRE_APPROVAL, APPROVED, REJECTED
- View with: `cat gateway/logs/events.jsonl | jq`

**Key Takeaways:**
- Default policy is ALLOW (dev/staging are unrestricted)
- Specific rules can DENY dangerous operations
- Production operations can require human approval
- Every decision is logged for audit and compliance

## Documentation

- **docs/architecture.md** - System architecture and components
- **docs/production-roadmap.md** - Production deployment guide and roadmap
- **docs/schemas.md** - Canonical schemas (DO NOT CHANGE)
- **docs/policies.md** - Default policy objectives
- **docs/build-order.md** - Implementation phases

## What's Implemented (Phase 1)

✅ Core policy engine with rule evaluation  
✅ Policy bundle loader with validation  
✅ Gateway HTTP server for tool call interception  
✅ Decision enforcement (ALLOW/DENY/REQUIRE_APPROVAL)  
✅ Approval workflow via REST endpoints  
✅ Append-only audit log (JSONL)  
✅ Default policy bundle with security rules  
✅ Demo script with test scenarios  

## Example Use Cases

- Block bulk data exports and sensitive data leaks
- Require approval for financial operations in production
- Allow unrestricted actions in dev/staging
- Audit all agent tool calls with detailed events
- Enforce data labeling policies (PII, PCI, etc.)
