# Integration Examples

This directory contains practical examples showing how to integrate the Agent Runtime Security SDK into different scenarios.

## Running Examples

```bash
# Build the SDK first
npm run build

# Run any example
npx ts-node examples/basic-usage.ts
npx ts-node examples/custom-approval.ts
npx ts-node examples/protect-wrapper.ts
npx ts-node examples/langchain-integration.ts
```

## Examples

### basic-usage.ts
**What it shows:** The simplest way to integrate the SDK
- Initialize with minimal config
- Check a tool call
- Handle the result
- Access audit trail

**Best for:** Getting started, understanding the basics

### custom-approval.ts
**What it shows:** How to implement custom approval workflows
- Custom approval system integration
- Callbacks for approvals and denials
- Handling approval responses
- Alerting on security events

**Best for:** Integrating with Slack, email, ticketing systems

### protect-wrapper.ts
**What it shows:** Using the `protect()` wrapper
- Wrapping existing functions
- Automatic security checks
- Error handling with SecurityError
- Multiple protected functions

**Best for:** Adding security to existing codebases with minimal changes

### langchain-integration.ts
**What it shows:** Integrating with LangChain-style agent frameworks
- Creating a SecureTool base class
- Security checks before tool execution
- Error handling in agent workflows
- Framework-agnostic pattern

**Best for:** Agent framework integration (LangChain, CrewAI, etc.)

## Creating Your Own Policy

All examples use the `./policy.json` file in the root directory. Create your own or modify the default:

```json
{
  "version": "0.1.0",
  "generated_at": "2026-01-29T00:00:00.000Z",
  "expires_at": "2027-01-29T00:00:00.000Z",
  "rules": [
    {
      "id": "YOUR_RULE_ID",
      "description": "What this rule does",
      "match": {
        "tool_name": "your_tool_name",
        "environment": "prod"
      },
      "outcome": "DENY"
    }
  ],
  "defaults": {
    "outcome": "ALLOW"
  }
}
```

## Common Patterns

### Pattern 1: Check then Execute
```typescript
const result = await security.checkToolCall({...});
if (result.allowed) {
  await executeTool();
}
```

### Pattern 2: Wrap with protect()
```typescript
const safeTool = security.protect('tool_name', unsafeTool);
await safeTool(); // Auto-checked
```

### Pattern 3: Framework Integration
```typescript
class MySecureTool extends BaseTool {
  async call(input: string) {
    const result = await security.checkToolCall({...});
    if (!result.allowed) throw new SecurityError();
    return await this.execute(input);
  }
}
```

## Next Steps

- Read the [API Reference](../docs/api-reference.md)
- Check out the [Policy Guide](../docs/policy-guide.md)
- Run the full demo: `npm run demo`
