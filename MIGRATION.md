# Migration Guide: Gateway → SDK

This document explains the transformation from a gateway-based architecture to an SDK-first approach.

## What Changed

### Removed Components

❌ **Gateway Service** (`gateway/`)
- HTTP server with Express
- Approval manager
- Audit log writer
- All gateway-related infrastructure

❌ **HTTP Client Demos**
- Demos that made HTTP calls to gateway
- Axios dependency

❌ **Gateway-Focused Documentation**
- `docs/production-roadmap.md` (SaaS deployment guide)
- Gateway setup scripts

### Added Components

✅ **Core SDK** (`core/src/sdk.ts`)
- `AgentSecurity` class - Main SDK client
- `checkToolCall()` method - Policy checking
- `protect()` wrapper - Function decoration
- Callback system for approvals/denials
- In-memory audit logging

✅ **Integration Examples** (`examples/`)
- Basic usage
- Custom approval workflows
- Function wrappers
- LangChain integration

✅ **SDK-Focused Demos**
- Direct SDK integration
- No HTTP calls
- In-process execution

## Architecture Comparison

### Before (Gateway)

```
Agent Code
    ↓ HTTP POST
Gateway Server (:3000)
    ↓
Policy Evaluator
    ↓
Return 200/403/202
    ↓
Agent handles response
```

**Pros:**
- Centralized enforcement
- No agent code changes

**Cons:**
- Infrastructure to deploy
- Network latency
- Gateway bottleneck
- More complex setup

### After (SDK)

```
Agent Code
    ↓ Direct call
AgentSecurity.checkToolCall()
    ↓
Policy Evaluator
    ↓
Return allowed=true/false
    ↓
Agent proceeds or blocks
```

**Pros:**
- Zero infrastructure
- No network latency
- Simple deployment (npm install)
- Flexible callbacks

**Cons:**
- Each agent needs integration
- No centralized enforcement point

## Migration Steps

If you were using the gateway approach, here's how to migrate:

### 1. Install SDK

```bash
npm install @agent-security/core
```

### 2. Initialize SDK (replace gateway URL)

**Before:**
```typescript
const GATEWAY_URL = "http://localhost:3000";
await axios.post(`${GATEWAY_URL}/tool-call`, request);
```

**After:**
```typescript
import { AgentSecurity } from '@agent-security/core';

const security = new AgentSecurity({
  policyPath: './policy.json'
});
```

### 3. Replace HTTP Calls with SDK Calls

**Before:**
```typescript
try {
  const response = await axios.post(`${GATEWAY_URL}/tool-call`, {
    request_id: uuidv4(),
    timestamp: new Date().toISOString(),
    agent: { agent_id: 'agent-1', environment: 'prod' },
    action: { tool_name: 'send_email', tool_args: {...} }
  });
  // Tool allowed
  await executeTool();
} catch (error) {
  // Tool denied or needs approval
}
```

**After:**
```typescript
const result = await security.checkToolCall({
  toolName: 'send_email',
  toolArgs: {...},
  agentId: 'agent-1',
  environment: 'prod'
});

if (result.allowed) {
  await executeTool();
}
```

### 4. Implement Approval Callback (replaces REST API)

**Before:**
```typescript
// Manual approval via REST API
await axios.post(`${GATEWAY_URL}/approvals/${approvalId}/approve`);
```

**After:**
```typescript
const security = new AgentSecurity({
  policyPath: './policy.json',
  
  onApprovalRequired: async (request, decision) => {
    // Your approval logic (Slack, email, etc.)
    return await getApprovalFromManager(request);
  }
});
```

### 5. Implement Audit Export (replaces JSONL files)

**Before:**
```typescript
// Gateway wrote to gateway/logs/events.jsonl
```

**After:**
```typescript
const security = new AgentSecurity({
  policyPath: './policy.json',
  
  onAuditEvent: (event) => {
    // Send to your audit system
    auditLogger.log(event);
  }
});
```

## Code Examples

### Example 1: Basic Tool Check

**Before (Gateway):**
```typescript
const response = await axios.post('http://localhost:3000/tool-call', {
  request_id: uuidv4(),
  timestamp: new Date().toISOString(),
  agent: {
    agent_id: 'my-agent',
    name: 'MyAgent',
    owner: 'me@company.com',
    environment: 'prod'
  },
  action: {
    type: 'tool_call',
    tool_name: 'send_email',
    tool_args: { to: 'user@example.com' }
  },
  context: {}
});
```

**After (SDK):**
```typescript
const result = await security.checkToolCall({
  toolName: 'send_email',
  toolArgs: { to: 'user@example.com' },
  agentId: 'my-agent',
  environment: 'prod'
});
```

### Example 2: Function Wrapper

**Before (Gateway):**
```typescript
async function sendEmail(to: string, body: string) {
  const response = await axios.post('http://localhost:3000/tool-call', {...});
  if (response.status === 200) {
    return await emailService.send(to, body);
  }
  throw new Error('Blocked by policy');
}
```

**After (SDK):**
```typescript
const sendEmail = security.protect(
  'send_email',
  async (to: string, body: string) => {
    return await emailService.send(to, body);
  },
  {
    agentId: 'my-agent',
    extractToolArgs: (to, body) => ({ to, body })
  }
);
```

## Policy Files

Policy files remain the same! No changes needed to `policy.json`.

## Benefits of SDK Approach

1. **Simpler Deployment**
   - No gateway server to run
   - No port 3000 to manage
   - Just `npm install`

2. **Lower Latency**
   - No HTTP overhead
   - In-process execution
   - Microsecond evaluation

3. **More Flexible**
   - Custom approval workflows
   - Your audit system
   - Your alert system

4. **Better for Open Source**
   - Easy to adopt
   - No infrastructure barrier
   - Works with any framework

5. **Enterprise Friendly**
   - Runs in their code
   - No external dependencies
   - Full control

## Running the New Demos

```bash
# Install dependencies
npm run install:all

# Build SDK
npm run build

# Run full demo (8 scenarios)
npm run demo

# Run quick demo (3 scenarios)
npm run demo:quick

# Run examples
npx ts-node examples/basic-usage.ts
npx ts-node examples/custom-approval.ts
```

## Key Differences

| Aspect | Gateway | SDK |
|--------|---------|-----|
| Deployment | Separate service | npm package |
| Latency | Network (ms) | In-process (μs) |
| Approvals | REST endpoints | Callbacks |
| Audit Log | JSONL files | Callbacks + in-memory |
| Setup | Complex | Simple |
| Integration | HTTP client | Direct import |
| Infrastructure | Required | None |

## Questions?

- Check the [README](./README.md) for SDK overview
- See [QUICKSTART](./QUICKSTART.md) for integration guide
- Review [examples/](./examples/) for patterns
- Read [docs/architecture.md](./docs/architecture.md) for details
