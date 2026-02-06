# Integration Examples

Practical examples showing how to integrate the Agent Runtime Security SDK.

## Running Examples

```bash
npm run build

npx ts-node examples/basic-usage.ts
npx ts-node examples/custom-approval.ts
npx ts-node examples/protect-wrapper.ts
npx ts-node examples/plugins-demo.ts
```

## Examples

### basic-usage.ts
Simplest integration — initialize, check a tool call, read the audit log.

### custom-approval.ts
Custom approval workflow with timeout support. Shows how to integrate with Slack, email, etc.

### protect-wrapper.ts
Wrap existing functions with `protect()` for automatic security checks.

### plugins-demo.ts
Demonstrates all four built-in plugins:
- **Kill Switch** — Emergency agent disable
- **Rate Limiter** — Per-agent, per-tool rate limits
- **Session Context** — Track state across calls within a session
- **Output Validator** — Scan tool results for sensitive data (SSN, credit cards, etc.)

## Creating Custom Plugins

```typescript
import { SecurityPlugin, BeforeCheckContext, PluginResult } from '../core/src';

const myPlugin: SecurityPlugin = {
  name: 'my-custom-plugin',
  version: '1.0.0',

  async beforeCheck(ctx: BeforeCheckContext): Promise<PluginResult | void> {
    // Your logic here
    // Return { decision: ... } to short-circuit
    // Return void to continue
  },

  async afterDecision(ctx) {
    // Modify decisions, add constraints, etc.
  },

  async afterExecution(ctx) {
    // Validate output, enrich audit, etc.
  },
};
```
