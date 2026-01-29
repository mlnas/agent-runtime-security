# Quick Start Guide

Get started with the Agent Runtime Security SDK in 5 minutes.

## Installation

```bash
# If you cloned the repo
npm run install:all
npm run build

# Or install as a package (when published)
npm install @agent-security/core
```

## Basic Usage

### 1. Create Your Policy

Create `policy.json`:

```json
{
  "version": "0.1.0",
  "generated_at": "2026-01-29T00:00:00.000Z",
  "expires_at": "2027-01-29T00:00:00.000Z",
  "rules": [
    {
      "id": "DENY_DANGEROUS_OPERATIONS",
      "description": "Block potentially dangerous database operations",
      "match": {
        "tool_name": "query_database",
        "environment": "*"
      },
      "when": {
        "contains_any": ["DROP", "DELETE", "TRUNCATE"]
      },
      "outcome": "DENY"
    },
    {
      "id": "REQUIRE_APPROVAL_PROD_EMAIL",
      "description": "Emails in production need approval",
      "match": {
        "tool_name": "send_email",
        "environment": "prod"
      },
      "outcome": "REQUIRE_APPROVAL",
      "approver_role": "ops_manager"
    }
  ],
  "defaults": {
    "outcome": "ALLOW"
  }
}
```

### 2. Initialize the SDK

```typescript
import { AgentSecurity } from '@agent-security/core';

const security = new AgentSecurity({
  policyPath: './policy.json',
  
  // Optional: Handle approval requests
  onApprovalRequired: async (request, decision) => {
    console.log('Approval needed for:', request.action.tool_name);
    // Integrate with your approval system (Slack, etc.)
    return await getApprovalFromManager(request);
  },
  
  // Optional: Get notified of denials
  onDeny: (request, decision) => {
    console.error('Action blocked:', decision.reasons);
  },
  
  // Optional: Log all decisions
  onAuditEvent: (event) => {
    auditLogger.log(event);
  }
});
```

### 3. Check Before Executing Tools

```typescript
async function executeAgentTool(toolName: string, args: any) {
  // Check security policy
  const result = await security.checkToolCall({
    toolName,
    toolArgs: args,
    agentId: 'my-agent-001',
    environment: 'prod'
  });

  if (result.allowed) {
    // Safe to execute
    return await actualToolExecution(toolName, args);
  } else {
    // Blocked by policy
    throw new Error(`Blocked: ${result.decision.reasons[0].message}`);
  }
}
```

## Run the Demos

### Full Demo (8 scenarios)

```bash
npm run demo
```

This demonstrates:
- ALLOW decisions for safe operations
- DENY decisions for dangerous operations
- REQUIRE_APPROVAL workflow with approve/reject
- Full audit trail

### Quick Demo (3 scenarios)

```bash
npm run demo:quick
```

A simplified demo showing the three decision types.

## What You'll See

```
╔════════════════════════════════════════════════════════════╗
║     Agent Runtime Security SDK - Demo                      ║
╚════════════════════════════════════════════════════════════╝

============================================================
Test 1: Safe Dev Action (should ALLOW)
============================================================

✅ ALLOWED
  Tool: query_database
  Agent: agent-001
  Reason: No specific rule matched; applying default policy
  📝 Event logged: abc123 (ALLOW)
  ➜ Tool execution would proceed here

============================================================
Test 2: Bulk Export Attempt (should DENY)
============================================================

❌ DENIED
  Tool: query_customer_db
  Agent: agent-002
  Reason: Block bulk export or data dump attempts
  📝 Event logged: def456 (DENY)
  ➜ Tool execution blocked
```

## Advanced Usage

### Protect Any Function

Wrap your existing functions with automatic security checks:

```typescript
const protectedFunction = security.protect(
  'my_tool',
  async (arg1: string, arg2: number) => {
    // Your tool logic
    return await doSomething(arg1, arg2);
  },
  {
    agentId: 'my-agent',
    environment: 'prod',
    extractToolArgs: (arg1, arg2) => ({ arg1, arg2 })
  }
);

// Automatically checked before execution
await protectedFunction('hello', 42);
```

### Custom Approval Workflow

```typescript
const security = new AgentSecurity({
  policyPath: './policy.json',
  
  onApprovalRequired: async (request, decision) => {
    // Send to Slack
    const slackResponse = await slack.sendMessage({
      channel: '#approvals',
      text: `Approval needed for ${request.action.tool_name}`,
      buttons: ['Approve', 'Deny']
    });
    
    // Wait for user response
    const approved = await slackResponse.waitForInteraction();
    return approved;
  }
});
```

### Access Audit Trail

```typescript
// Get all audit events
const events = security.getAuditLog();

events.forEach(event => {
  console.log(`${event.timestamp}: ${event.outcome} - ${event.tool_name}`);
});

// Clear history (e.g., after sending to external storage)
security.clearAuditLog();
```

## Policy Development Tips

1. **Start Permissive**: Begin with default ALLOW and add specific DENY rules
2. **Test in Dev First**: Use environment matching to test policies safely
3. **Use Keywords Carefully**: The `contains_any` matcher is case-insensitive
4. **Version Your Policies**: Treat policies like code - use Git
5. **Monitor Audit Logs**: Review what's being blocked/allowed

## Common Patterns

### Development vs Production

```json
{
  "rules": [
    {
      "id": "ALLOW_DEV",
      "match": { "tool_name": "*", "environment": "dev" },
      "outcome": "ALLOW"
    },
    {
      "id": "REQUIRE_APPROVAL_PROD",
      "match": { "tool_name": "dangerous_tool", "environment": "prod" },
      "outcome": "REQUIRE_APPROVAL"
    }
  ]
}
```

### Keyword-Based Blocking

```json
{
  "id": "DENY_SQL_INJECTION",
  "match": { "tool_name": "query_database", "environment": "*" },
  "when": {
    "contains_any": ["DROP", "DELETE", "TRUNCATE", "--", ";--"]
  },
  "outcome": "DENY"
}
```

### Data Label Protection

```json
{
  "id": "DENY_PII_EXPORT",
  "match": { "tool_name": "send_email", "environment": "*" },
  "when": {
    "data_labels_any": ["PII", "PCI", "PHI"]
  },
  "outcome": "DENY"
}
```

## Next Steps

- Read the [Policy Writing Guide](./docs/policy-guide.md)
- Check out [Integration Examples](./docs/integrations/)
- Review the [API Reference](./docs/api-reference.md)
- See [Architecture Overview](./docs/architecture.md)

## Need Help?

- Check existing [GitHub Issues](https://github.com/your-org/agent-runtime-security/issues)
- Start a [Discussion](https://github.com/your-org/agent-runtime-security/discussions)
- Review the demo code in `demo.ts`
