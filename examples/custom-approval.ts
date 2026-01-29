/**
 * Custom Approval Workflow Example
 * 
 * This example shows how to integrate with your own approval system.
 */

import { AgentSecurity } from '../core/src/sdk';
import { AgentActionRequest, Decision } from '../core/src/schemas';
import * as path from 'path';

// Mock approval system (replace with Slack, email, etc.)
class ApprovalSystem {
  async requestApproval(request: AgentActionRequest, decision: Decision): Promise<boolean> {
    console.log('\n📋 Approval Request:');
    console.log(`  Tool: ${request.action.tool_name}`);
    console.log(`  Agent: ${request.agent.agent_id}`);
    console.log(`  Environment: ${request.agent.environment}`);
    console.log(`  Approver: ${decision.approver_role || 'any'}`);
    console.log(`  Args:`, JSON.stringify(request.action.tool_args, null, 2));
    
    // In real implementation, this would:
    // - Send Slack message with buttons
    // - Create approval ticket
    // - Send email with approval link
    // - Wait for human response
    
    // For demo, auto-approve
    return true;
  }
}

const approvalSystem = new ApprovalSystem();

// Initialize SDK with custom approval handler
const security = new AgentSecurity({
  policyPath: path.join(__dirname, '../default-policy.json'),
  
  onApprovalRequired: async (request, decision) => {
    // Integrate with your approval system
    const approved = await approvalSystem.requestApproval(request, decision);
    
    if (approved) {
      console.log('  ✓ Approved by manager');
    } else {
      console.log('  ✗ Rejected by manager');
    }
    
    return approved;
  },
  
  onDeny: (request, decision) => {
    // Alert security team
    console.log('🚨 Security Alert: Action was blocked');
    console.log(`  Tool: ${request.action.tool_name}`);
    console.log(`  Agent: ${request.agent.agent_id}`);
    console.log(`  Reason: ${decision.reasons[0].message}`);
  }
});

async function main() {
  // This will trigger the approval workflow
  const result = await security.checkToolCall({
    toolName: 'trigger_payment',
    toolArgs: {
      amount: 5000,
      currency: 'USD',
      recipient: 'vendor@example.com'
    },
    agentId: 'payment-agent',
    environment: 'prod'
  });

  if (result.allowed) {
    console.log('\n✓ Payment approved and can be executed');
    // await paymentService.process(...);
  } else {
    console.log('\n✗ Payment was not approved');
  }
}

main();
