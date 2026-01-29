# Agent Runtime Security SDK

**Open-source SDK for adding runtime security policies to AI agents**

Protect your AI agents with declarative security policies that run directly in your code. No gateway, no infrastructure, just `npm install` and integrate.

## Why This SDK?

AI agents can access sensitive data, make API calls, and execute actions on your behalf. Without runtime security, a prompt injection or rogue agent could:

- Export your entire customer database
- Send PII/PCI data to external systems
- Execute unauthorized financial transactions
- Delete production data

This SDK lets you define **security policies as code** and enforce them at runtime, right where your agent executes.

## Key Features

✅ **Zero Infrastructure** - Runs in-process, no gateway or server needed  
✅ **Policy as Code** - Define rules in JSON, version control with Git  
✅ **Three Decision Types** - ALLOW, DENY, or REQUIRE_APPROVAL  
✅ **Custom Approval Workflows** - Integrate with Slack, email, or any system  
✅ **Full Audit Trail** - Every decision is logged for compliance  
✅ **Framework Agnostic** - Works with LangChain, CrewAI, custom agents, etc.  
✅ **TypeScript Native** - Full type safety and IDE autocomplete  
✅ **Production Ready** - Built for enterprise integration  

## Quick Start

### 1. Install

```bash
npm install @agent-security/core
```

### 2. Create a Policy

Create `policy.json`:

```json
{
  "version": "0.1.0",
  "generated_at": "2026-01-29T00:00:00.000Z",
  "expires_at": "2027-01-29T00:00:00.000Z",
  "rules": [
    {
      "id": "DENY_BULK_EXPORT",
      "description": "Block bulk data exports",
      "match": {
        "tool_name": "query_database",
        "environment": "*"
      },
      "when": {
        "contains_any": ["SELECT *", "export", "dump"]
      },
      "outcome": "DENY"
    },
    {
      "id": "REQUIRE_APPROVAL_PAYMENT",
      "description": "Payments need approval in production",
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

### 3. Integrate with Your Agent

```typescript
import { AgentSecurity } from '@agent-security/core';

// Initialize SDK
const security = new AgentSecurity({
  policyPath: './policy.json',
  onApprovalRequired: async (request, decision) => {
    // Your custom approval logic (Slack, email, etc.)
    return await askManager(request);
  },
  onDeny: (request, decision) => {
    logger.error('Action blocked', { request, decision });
  }
});

// Before executing any tool, check the policy
async function executeTool(toolName: string, args: any) {
  const result = await security.checkToolCall({
    toolName,
    toolArgs: args,
    agentId: 'my-agent',
    environment: 'prod'
  });

  if (result.allowed) {
    // Execute the tool
    return await actualToolExecution(toolName, args);
  } else {
    throw new Error('Security policy blocked this action');
  }
}
```

### 4. Or Use the Protect Wrapper

```typescript
// Wrap any async function with security checks
const sendEmail = security.protect(
  'send_email',
  async (to: string, subject: string, body: string) => {
    return await emailService.send({ to, subject, body });
  },
  {
    agentId: 'email-agent',
    environment: 'prod',
    extractToolArgs: (to, subject, body) => ({ to, subject, body })
  }
);

// Automatically checked before execution
await sendEmail('user@example.com', 'Hello', 'World');
```

## How It Works

1. **Define Policies** - Create rules in JSON that match tool calls by name, environment, keywords, or data labels
2. **Initialize SDK** - Load your policy and configure callbacks for approvals/denies
3. **Check Before Execute** - Before any tool runs, call `security.checkToolCall()`
4. **Handle Decision** - SDK returns ALLOW, DENY, or REQUIRE_APPROVAL
5. **Audit Everything** - All decisions are logged automatically

## Policy Rules

Each rule has:

- **match**: Which tools and environments this applies to
- **when**: Optional conditions (keywords, data labels)
- **outcome**: ALLOW, DENY, or REQUIRE_APPROVAL
- **approver_role**: Optional role required for approval

### Example Rules

**Block bulk exports:**
```json
{
  "id": "DENY_BULK_EXPORT",
  "match": { "tool_name": "query_database", "environment": "*" },
  "when": { "contains_any": ["SELECT *", "export all"] },
  "outcome": "DENY"
}
```

**Require approval for financial operations:**
```json
{
  "id": "APPROVE_PAYMENTS",
  "match": { "tool_name": "trigger_payment", "environment": "prod" },
  "outcome": "REQUIRE_APPROVAL",
  "approver_role": "finance_manager"
}
```

**Block PII/PCI data transmission:**
```json
{
  "id": "DENY_SENSITIVE_DATA",
  "match": { "tool_name": "send_email", "environment": "*" },
  "when": { "data_labels_any": ["PII", "PCI"] },
  "outcome": "DENY"
}
```

## Run the Demo

```bash
# Clone the repo
git clone https://github.com/your-org/agent-runtime-security
cd agent-runtime-security

# Install dependencies
npm run install:all

# Run the full demo
npm run demo

# Or run the quick 3-scenario demo
npm run demo:quick
```

The demo shows:
- ✅ Safe actions being allowed
- ❌ Dangerous actions being denied
- ⏳ Sensitive actions requiring approval
- 📝 Full audit trail capture

## Integration Examples

### LangChain

```typescript
import { AgentSecurity } from '@agent-security/core';
import { Tool } from 'langchain/tools';

const security = new AgentSecurity({ policyPath: './policy.json' });

class SecureTool extends Tool {
  async _call(input: string): Promise<string> {
    const result = await security.checkToolCall({
      toolName: this.name,
      toolArgs: { input },
      agentId: 'langchain-agent',
      environment: 'prod'
    });

    if (!result.allowed) {
      throw new Error(`Blocked by security policy: ${result.decision.reasons[0].message}`);
    }

    return await this.actualToolLogic(input);
  }
}
```

### Custom Agent Framework

```typescript
class MyAgent {
  constructor(private security: AgentSecurity) {}

  async executeAction(action: Action) {
    const result = await this.security.checkToolCall({
      toolName: action.tool,
      toolArgs: action.args,
      agentId: this.id,
      environment: this.environment,
      userInput: action.userPrompt
    });

    if (!result.allowed) {
      return { error: 'Action blocked by security policy' };
    }

    return await this.runTool(action);
  }
}
```

## API Reference

### AgentSecurity

**Constructor Options:**
- `policyPath`: Path to policy JSON file
- `policyJson`: Policy as JSON string (alternative to path)
- `onApprovalRequired`: Async callback for approval decisions
- `onDeny`: Callback when action is denied
- `onAllow`: Callback when action is allowed
- `onAuditEvent`: Callback for all audit events
- `defaultEnvironment`: Default environment for checks
- `defaultOwner`: Default agent owner

**Methods:**
- `checkToolCall(params)`: Check if a tool call is allowed
- `protect(toolName, fn, options)`: Wrap a function with security
- `getAuditLog()`: Get all audit events
- `clearAuditLog()`: Clear audit history
- `getPolicyBundle()`: Get current policy
- `reloadPolicy()`: Reload policy from file/JSON

See [API Documentation](./docs/api-reference.md) for full details.

## Use Cases

### Customer Support Agents
- Block customer data deletion
- Require approval for large refunds
- Prevent PII leakage via email

### Data Analytics Agents
- Block bulk data exports
- Prevent write operations (UPDATE/DELETE)
- Require approval for PII table access

### Marketing Automation Agents
- Require approval for bulk emails
- Block emails to external domains
- Time-gate campaigns outside business hours

### Financial Agents
- Require approval for all payments/refunds
- Block operations above threshold
- Enforce dual-approval for large amounts

## Documentation

- [Getting Started Guide](./docs/getting-started.md)
- [Policy Writing Guide](./docs/policy-guide.md)
- [API Reference](./docs/api-reference.md)
- [Integration Examples](./docs/integrations/)
- [Architecture](./docs/architecture.md)

## Contributing

We welcome contributions! This is an open-source project designed for the community.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/your-org/agent-runtime-security/issues)
- Discussions: [Ask questions and share ideas](https://github.com/your-org/agent-runtime-security/discussions)

---

**Built for enterprises integrating AI agents into production systems.**
