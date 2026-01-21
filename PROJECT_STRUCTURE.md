# Project Structure

```
agent-runtime-security/
│
├── README.md                   # Main project overview
├── QUICKSTART.md              # Quick start guide with commands
├── IMPLEMENTATION.md          # Detailed implementation summary
├── PROJECT_STRUCTURE.md       # This file
├── setup.sh                   # Automated setup script
├── package.json               # Root package.json with scripts
├── demo.ts                    # Demo script to test the system
├── default-policy.json        # Default policy bundle
├── .gitignore                 # Git ignore file
│
├── docs/                      # Documentation (requirements)
│   ├── architecture.md        # System architecture specification
│   ├── schemas.md            # Canonical schemas (DO NOT CHANGE)
│   ├── policies.md           # Default policy objectives
│   └── build-order.md        # Implementation phases
│
├── core/                      # Core policy evaluation engine
│   ├── package.json          # Core dependencies
│   ├── tsconfig.json         # TypeScript config
│   ├── src/
│   │   ├── schemas.ts        # Type definitions matching docs/schemas.md
│   │   ├── loader.ts         # PolicyBundleLoader
│   │   ├── evaluator.ts      # PolicyEvaluator (Request → Decision)
│   │   └── index.ts          # Export module
│   └── dist/                 # Compiled JavaScript (generated)
│
├── gateway/                   # Gateway enforcement runtime
│   ├── package.json          # Gateway dependencies
│   ├── tsconfig.json         # TypeScript config
│   ├── src/
│   │   ├── server.ts         # Express HTTP server with enforcement
│   │   ├── audit-log.ts      # Append-only JSONL audit log writer
│   │   ├── approval-manager.ts # In-memory approval workflow
│   │   └── index.ts          # Main entry point
│   ├── dist/                 # Compiled JavaScript (generated)
│   └── logs/                 # Audit logs directory (generated)
│
├── control-plane/             # Future: Policy management UI
│   └── (empty - Phase 2)
│
└── sdk/                       # Future: Developer SDK
    └── (empty - Phase 2)
```

## Module Descriptions

### Core (`/core`)
- **Purpose**: Shared policy evaluation engine
- **Exports**: Schemas, PolicyBundleLoader, PolicyEvaluator
- **Dependencies**: None (pure logic, no HTTP/DB)
- **Used by**: Gateway, future SDK

### Gateway (`/gateway`)
- **Purpose**: HTTP enforcement runtime
- **Exports**: GatewayServer, AuditLog, ApprovalManager
- **Dependencies**: Core engine, Express
- **Runs as**: Standalone HTTP server on port 3000

### Docs (`/docs`)
- **Purpose**: Specification and requirements
- **Status**: Complete and authoritative
- **Files are**: Read-only (do not modify)

### Root Files
- **demo.ts**: Comprehensive test scenarios
- **default-policy.json**: Production-ready policy bundle
- **setup.sh**: Automated setup script
- **package.json**: Scripts for build/run/demo

## Data Flow

```
Agent Tool Call Request
    ↓
Gateway Server (:3000)
    ↓
Core Evaluator
    ↓
Decision (ALLOW/DENY/REQUIRE_APPROVAL)
    ↓
Gateway Enforcement
    ├─→ ALLOW: Return 200 + forward
    ├─→ DENY: Return 403 + block
    └─→ REQUIRE_APPROVAL: Return 202 + create pending approval
         ↓
    Approval Endpoint
         ├─→ /approve: Mark approved
         └─→ /reject: Mark rejected
    ↓
Audit Log (JSONL)
```

## Key Files by Function

### Schema Definitions
- `core/src/schemas.ts` - All TypeScript interfaces
- `docs/schemas.md` - Schema specification

### Policy Engine
- `core/src/loader.ts` - Load and validate policy bundles
- `core/src/evaluator.ts` - Evaluate requests against rules
- `default-policy.json` - Default policy bundle

### Enforcement
- `gateway/src/server.ts` - HTTP server and endpoints
- `gateway/src/approval-manager.ts` - Approval workflow

### Audit
- `gateway/src/audit-log.ts` - Append-only JSONL writer
- `gateway/logs/*.jsonl` - Event logs (generated)

### Testing
- `demo.ts` - Comprehensive demo scenarios

## Build Artifacts (Generated)

These directories are created during build:
- `core/dist/` - Compiled core engine
- `gateway/dist/` - Compiled gateway server
- `gateway/logs/` - Audit log files
- `node_modules/` - Dependencies (3 locations)

All build artifacts are git-ignored.

## Phase 1 Implementation Status

✅ **Completed**:
- Core engine with schema validation
- Policy bundle loader and evaluator
- Gateway HTTP server
- Decision enforcement (ALLOW/DENY/REQUIRE_APPROVAL)
- Approval workflow via REST API
- Append-only audit log (JSONL)
- Default policy bundle
- Demo script
- Documentation

❌ **Not Implemented** (Phase 2):
- control-plane/ - Policy management UI
- sdk/ - Developer SDK wrapper
- Multi-tenant features
- RBAC/SSO
- Slack integration
- Policy signing/verification
- Distributed audit storage

## Next Steps

1. Run `./setup.sh` to install and build
2. Start gateway: `npm run start:gateway`
3. Run demo: `npm run demo`
4. Review audit logs in `gateway/logs/`
5. Customize policies in `default-policy.json`

See QUICKSTART.md for detailed instructions.
