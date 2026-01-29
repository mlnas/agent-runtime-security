# Project Structure

```
agent-runtime-security/
│
├── README.md                   # SDK overview and quick start
├── QUICKSTART.md              # Detailed getting started guide
├── IMPLEMENTATION.md          # Implementation notes
├── PROJECT_STRUCTURE.md       # This file
├── package.json               # Root package (demos)
├── demo.ts                    # Full demo with all scenarios
├── test-demo.ts               # Quick 3-scenario demo
├── default-policy.json        # Example policy bundle
├── .gitignore                 # Git ignore
│
├── core/                      # Core SDK package
│   ├── package.json          # @agent-security/core
│   ├── tsconfig.json         # TypeScript config
│   ├── src/
│   │   ├── schemas.ts        # TypeScript type definitions
│   │   ├── loader.ts         # Policy bundle loader
│   │   ├── evaluator.ts      # Policy evaluation engine
│   │   ├── events.ts         # Audit event generator
│   │   ├── default-policy.ts # Default policy factory
│   │   ├── sdk.ts            # Main SDK client (NEW)
│   │   └── index.ts          # Public exports
│   └── dist/                 # Compiled output (generated)
│
├── examples/                  # Integration examples (NEW)
│   ├── README.md             # Examples overview
│   ├── basic-usage.ts        # Simple integration
│   ├── custom-approval.ts    # Custom approval workflow
│   ├── protect-wrapper.ts    # Using protect() wrapper
│   └── langchain-integration.ts # LangChain integration
│
└── docs/                      # Documentation
    ├── architecture.md        # SDK architecture
    ├── schemas.md            # Schema specifications
    ├── policies.md           # Policy writing guide
    └── build-order.md        # Development phases
```

## What Changed

### Removed (Gateway-based approach)
- ❌ `gateway/` - Separate HTTP server
- ❌ `setup.sh` - Complex setup script
- ❌ `docs/production-roadmap.md` - SaaS deployment docs
- ❌ HTTP client dependencies (axios)
- ❌ Express server code

### Added (SDK-first approach)
- ✅ `core/src/sdk.ts` - Main SDK client
- ✅ `examples/` - Integration examples
- ✅ Updated demos using SDK directly
- ✅ SDK-focused documentation

## Module Structure

### Core (`/core`)
**Purpose**: The SDK package that enterprises install

**Exports**:
- `AgentSecurity` - Main SDK client class
- `SecurityError` - Custom error for blocked actions
- Type definitions (schemas)
- Policy loader and evaluator

**Usage**:
```typescript
import { AgentSecurity } from '@agent-security/core';
```

### Examples (`/examples`)
**Purpose**: Integration patterns and reference implementations

**Contents**:
- Basic usage example
- Custom approval workflows
- Function wrappers with `protect()`
- Agent framework integration

### Docs (`/docs`)
**Purpose**: Technical documentation

**Files**:
- `architecture.md` - How the SDK works
- `schemas.md` - Type specifications
- `policies.md` - Policy writing guide
- `build-order.md` - Development roadmap

## Key Files

### SDK Implementation
- `core/src/sdk.ts` - Main SDK client with all features
- `core/src/evaluator.ts` - Policy rule evaluation
- `core/src/loader.ts` - Policy bundle loading/validation
- `core/src/events.ts` - Audit event generation

### Demos
- `demo.ts` - Comprehensive demo (8 scenarios)
- `test-demo.ts` - Quick demo (3 scenarios)
- `default-policy.json` - Example policy bundle

### Examples
- `examples/basic-usage.ts` - Simplest integration
- `examples/protect-wrapper.ts` - Function wrapping
- `examples/custom-approval.ts` - Custom workflows
- `examples/langchain-integration.ts` - Framework integration

## Data Flow (New SDK Architecture)

```
Your Agent Code
    ↓
AgentSecurity.checkToolCall()
    ↓
PolicyEvaluator.evaluate()
    ↓
Decision (ALLOW/DENY/REQUIRE_APPROVAL)
    ↓
Callbacks (onAllow/onDeny/onApprovalRequired)
    ↓
Your Integration (Slack/Email/etc.)
    ↓
Return allowed=true/false
    ↓
Execute or block tool
```

## Build Process

```bash
# Install dependencies
npm run install:all

# Build TypeScript
npm run build

# Run demos
npm run demo           # Full demo
npm run demo:quick     # Quick demo
```

## Development Workflow

1. **Policy Development**
   - Edit `default-policy.json`
   - Test with demos
   - Iterate on rules

2. **SDK Development**
   - Edit `core/src/*.ts`
   - Run `npm run build`
   - Test with demos

3. **Integration Development**
   - Create new examples in `examples/`
   - Document patterns
   - Share with community

## What's Implemented

✅ **Core SDK**
- Policy evaluation engine
- Rule matching and conditions
- Three decision types
- Audit event generation
- SDK client with callbacks
- Function wrapper (`protect()`)

✅ **Demos**
- Full demo with 8 scenarios
- Quick 3-scenario demo
- Example policy bundle
- Audit trail display

✅ **Examples**
- Basic usage
- Custom approvals
- Function wrappers
- Framework integration

✅ **Documentation**
- SDK-focused README
- Quick start guide
- Architecture overview
- Integration patterns

## What's NOT Included

❌ **Infrastructure** (by design)
- No HTTP gateway
- No separate server
- No deployment complexity
- No authentication layer

❌ **UI Components** (separate project)
- No policy management UI
- No approval dashboard
- No visualization tools

❌ **Advanced Features** (future)
- Policy signing/verification
- Distributed audit storage
- Multi-tenant features
- Advanced analytics

## Integration Points

### Where Enterprises Integrate

1. **Agent Initialization**
   ```typescript
   const security = new AgentSecurity({...});
   ```

2. **Tool Execution**
   ```typescript
   await security.checkToolCall({...});
   ```

3. **Approval Workflow**
   ```typescript
   onApprovalRequired: async (req) => {...}
   ```

4. **Audit System**
   ```typescript
   onAuditEvent: (event) => {...}
   ```

## Target Deployment

This SDK is designed to be:
- **Installed**: via npm/yarn
- **Imported**: directly into agent code
- **Configured**: with JSON policy files
- **Extended**: via callbacks and wrappers

No infrastructure, no gateway, no deployment complexity.

## Next Steps

1. Publish to npm as `@agent-security/core`
2. Create framework-specific packages
3. Build policy management tools (separate repo)
4. Community examples and integrations
