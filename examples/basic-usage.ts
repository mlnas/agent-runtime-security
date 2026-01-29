/**
 * Basic Usage Example
 * 
 * This example shows the simplest way to integrate the SDK.
 */

import { AgentSecurity } from '../core/src/sdk';
import * as path from 'path';

// Initialize with minimal configuration
const security = new AgentSecurity({
  policyPath: path.join(__dirname, '../default-policy.json'),
  defaultEnvironment: 'dev'
});

async function main() {
  // Check a tool call before executing
  const result = await security.checkToolCall({
    toolName: 'send_email',
    toolArgs: {
      to: 'user@example.com',
      subject: 'Hello',
      body: 'Welcome to our service'
    },
    agentId: 'email-agent-001',
    environment: 'prod'
  });

  if (result.allowed) {
    console.log('✓ Email is allowed by security policy');
    // Execute the actual tool
    // await emailService.send(...);
  } else {
    console.log('✗ Email was blocked by security policy');
    console.log('Reason:', result.decision.reasons[0].message);
  }

  // Get audit trail
  const auditLog = security.getAuditLog();
  console.log(`\nAudit events: ${auditLog.length}`);
  auditLog.forEach(event => {
    console.log(`  - ${event.outcome}: ${event.tool_name}`);
  });
}

main();
