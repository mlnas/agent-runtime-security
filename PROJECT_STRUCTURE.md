# Project Structure

```
agent-runtime-security/
│
├── README.md                       # SDK overview and quick start
├── QUICKSTART.md                   # Getting started guide
├── IMPLEMENTATION.md               # Implementation details and design decisions
├── PROJECT_STRUCTURE.md            # This file
├── package.json                    # Root package (scripts for demos/build)
├── tsconfig.json                   # Root TypeScript config
├── demo.ts                         # Full demo (9 scenarios with plugins)
├── test-demo.ts                    # Quick demo (5 scenarios)
├── default-policy.json             # Example policy bundle
├── .gitignore                      # Git ignore rules
│
├── core/                           # Core SDK package
│   ├── package.json                # @agent-security/core
│   ├── tsconfig.json               # TypeScript config
│   ├── src/
│   │   ├── index.ts                # Public exports (SDK, plugins, types)
│   │   ├── sdk.ts                  # Main SDK client + plugin pipeline
│   │   ├── schemas.ts              # TypeScript type definitions (v0.2)
│   │   ├── evaluator.ts            # Policy evaluation engine (v0.2)
│   │   ├── loader.ts               # Policy bundle loader (sync + async)
│   │   ├── events.ts               # Audit event generator (UUID, plugin source)
│   │   ├── default-policy.ts       # Default policy factory
│   │   └── plugins/                # Built-in plugins
│   │       ├── index.ts            # Plugin barrel exports
│   │       ├── kill-switch.ts      # Emergency agent disable
│   │       ├── rate-limiter.ts     # Per-agent/per-tool rate limiting
│   │       ├── session-context.ts  # Cross-call session tracking
│   │       └── output-validator.ts # Post-execution output scanning
│   └── dist/                       # Compiled output (generated)
│
├── examples/                       # Integration examples
│   ├── basic-usage.ts              # Simplest integration
│   ├── custom-approval.ts          # Approval workflow with timeout
│   ├── protect-wrapper.ts          # Function wrapping pattern
│   └── plugins-demo.ts             # All four built-in plugins
│
└── docs/                           # Documentation
    ├── architecture.md             # SDK architecture + plugin pipeline
    ├── schemas.md                  # Schema specifications (v0.2)
    ├── policies.md                 # Policy writing guide
    └── build-order.md              # Development phases
```

## Module Structure

### Core (`/core`)

**Purpose**: The SDK package that enterprises install.

**Exports**:
- `AgentSecurity` — Main SDK client class
- `SecurityError` — Custom error for blocked actions
- `killSwitch` / `KillSwitchPlugin` — Emergency stop plugin
- `rateLimiter` / `RateLimiterPlugin` — Rate limiting plugin
- `sessionContext` / `SessionContextPlugin` — Session tracking plugin
- `outputValidator` / `OutputValidatorPlugin` — Output scanning plugin
- All type definitions (schemas, plugin interfaces)
- Policy loader and evaluator

**Usage**:
```typescript
import {
  AgentSecurity,
  killSwitch,
  rateLimiter,
  sessionContext,
  outputValidator,
} from '@agent-security/core';
```

### Examples (`/examples`)

**Purpose**: Integration patterns and reference implementations.

**Contents**:
- Basic usage — minimal configuration
- Custom approval workflows — Slack/email/ticketing patterns
- Function wrappers with `protect()` — decorative security
- Plugin usage — kill switch, rate limiter, session context, output validator

### Docs (`/docs`)

**Purpose**: Technical documentation.

**Files**:
- `architecture.md` — SDK architecture and plugin pipeline data flow
- `schemas.md` — Type specifications (v0.2)
- `policies.md` — Policy writing guide
- `build-order.md` — Development phases

## Data Flow

```
Your Agent Code
    ↓
AgentSecurity.checkToolCall()
    ↓
Phase 1: beforeCheck plugins (kill switch, rate limiter, session context)
    ↓ (may short-circuit with DENY)
Phase 2: PolicyEvaluator.evaluate()
    ↓
Phase 3: afterDecision plugins (modify/override)
    ↓
Decision (ALLOW / DENY / REQUIRE_APPROVAL)
    ↓
Phase 4: Callbacks (onAllow / onDeny / onApprovalRequired)
    ↓
Return { allowed, decision, events }
    ↓
Execute or block tool

[If using protect() wrapper]:
    ↓
Phase 5: afterExecution plugins (output validator)
    ↓
Return result or throw
```

## Build Process

```bash
# Install dependencies
npm run install:all

# Build TypeScript
npm run build

# Run demos
npm run demo           # Full demo (9 scenarios)
npm run demo:quick     # Quick demo (5 scenarios)
```

## Key Files

### SDK Implementation
- `core/src/sdk.ts` — Main client with 5-phase plugin pipeline
- `core/src/evaluator.ts` — Rule matching (arrays, globs, regex, numeric comparisons)
- `core/src/loader.ts` — Sync + async policy loading
- `core/src/events.ts` — UUID-based audit events with plugin attribution
- `core/src/schemas.ts` — All type definitions including plugin interfaces

### Built-in Plugins
- `core/src/plugins/kill-switch.ts` — Emergency agent disable
- `core/src/plugins/rate-limiter.ts` — Sliding window rate limits
- `core/src/plugins/session-context.ts` — Per-session tool usage tracking
- `core/src/plugins/output-validator.ts` — Post-execution scanning

### Demos
- `demo.ts` — 9 scenarios (plugins, approvals, advanced rules)
- `test-demo.ts` — 5 scenarios (quick smoke test)
- `default-policy.json` — Example policy bundle

### Examples
- `examples/basic-usage.ts` — Minimal integration
- `examples/custom-approval.ts` — Approval with timeout
- `examples/protect-wrapper.ts` — Function wrapping
- `examples/plugins-demo.ts` — All built-in plugins
