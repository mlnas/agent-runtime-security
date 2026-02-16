#!/bin/bash

# Quick demo script designed to be recorded as a GIF
# Shows the core value prop in 30 seconds

set -e

echo "🚀 Agent-SPM Demo"
echo ""
echo "1️⃣  Agent tries to export customer database..."
sleep 1

cat << 'EOF' > /tmp/demo-policy.json
{
  "version": "1.0.0",
  "generated_at": "2025-01-15T00:00:00Z",
  "expires_at": "2026-01-15T00:00:00Z",
  "rules": [{
    "id": "BLOCK_BULK_EXPORT",
    "description": "Prevent mass data export",
    "match": { "tool_name": "query_db", "environment": "prod" },
    "when": { "contains_any": ["SELECT *", "LIMIT 10000"] },
    "outcome": "DENY"
  }],
  "defaults": { "outcome": "ALLOW" }
}
EOF

node -e "
const { AgentSecurity } = require('./core/dist/index.js');
const security = new AgentSecurity({ policyPath: '/tmp/demo-policy.json' });

(async () => {
  const result = await security.checkToolCall({
    toolName: 'query_db',
    toolArgs: { query: 'SELECT * FROM customers' },
    agentId: 'demo-agent',
    environment: 'prod',
  });

  console.log(result.allowed ? '✅ ALLOWED' : '❌ BLOCKED');
  console.log('Reason:', result.decision.reasons[0].message);
})();
"

echo ""
echo "2️⃣  Same agent tries safe query..."
sleep 1

node -e "
const { AgentSecurity } = require('./core/dist/index.js');
const security = new AgentSecurity({ policyPath: '/tmp/demo-policy.json' });

(async () => {
  const result = await security.checkToolCall({
    toolName: 'query_db',
    toolArgs: { query: 'SELECT name FROM customers LIMIT 10' },
    agentId: 'demo-agent',
    environment: 'prod',
  });

  console.log(result.allowed ? '✅ ALLOWED' : '❌ BLOCKED');
})();
"

echo ""
echo "✨ That's Agent-SPM - runtime security for AI agents"
