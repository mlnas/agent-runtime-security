#!/usr/bin/env ts-node

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { AgentActionRequest } from "./core/src/schemas";

const GATEWAY_URL = "http://localhost:3000";

/**
 * Demo script to test the Agent Runtime Security system
 */

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testToolCall(
  name: string,
  request: AgentActionRequest
): Promise<string | undefined> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Test: ${name}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Agent: ${request.agent.name} (${request.agent.environment})`);
  console.log(`Tool: ${request.action.tool_name}`);
  console.log(`Args:`, JSON.stringify(request.action.tool_args, null, 2));

  try {
    const response = await axios.post(`${GATEWAY_URL}/tool-call`, request);
    console.log(`✅ Result: ALLOWED`);
    console.log(`Response:`, JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    if (error.response) {
      if (error.response.status === 403) {
        console.log(`❌ Result: DENIED`);
        console.log(`Response:`, JSON.stringify(error.response.data, null, 2));
      } else if (error.response.status === 202 && error.response.data.approval_required) {
        console.log(`⏳ Result: REQUIRES APPROVAL`);
        console.log(`Approval ID: ${error.response.data.approval_id}`);
        console.log(`Response:`, JSON.stringify(error.response.data, null, 2));
        return error.response.data.approval_id;
      } else {
        console.log(`⚠️  Error:`, error.response.data);
      }
    } else {
      console.log(`⚠️  Error:`, error.message);
    }
  }
  return undefined;
}

async function testApproval(approval_id: string, approve: boolean): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Test: ${approve ? "APPROVE" : "REJECT"} Request`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Approval ID: ${approval_id}`);

  try {
    const endpoint = approve ? "approve" : "reject";
    const response = await axios.post(
      `${GATEWAY_URL}/approvals/${approval_id}/${endpoint}`
    );
    console.log(`✅ ${approve ? "Approved" : "Rejected"} successfully`);
    console.log(`Response:`, JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.log(`⚠️  Error:`, error.response?.data || error.message);
  }
}

async function listPendingApprovals(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Listing Pending Approvals`);
  console.log(`${"=".repeat(60)}`);

  try {
    const response = await axios.get(`${GATEWAY_URL}/approvals`);
    console.log(`Pending approvals: ${response.data.approvals.length}`);
    response.data.approvals.forEach((approval: any) => {
      console.log(`\n- Approval ID: ${approval.approval_id}`);
      console.log(`  Tool: ${approval.tool_name}`);
      console.log(`  Agent: ${approval.agent_id}`);
      console.log(`  Created: ${approval.created_at}`);
    });
  } catch (error: any) {
    console.log(`⚠️  Error:`, error.response?.data || error.message);
  }
}

async function exportAuditLog(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Audit Log Location`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\nAudit events are written to: gateway/logs/events.jsonl`);
  console.log(`You can view them with: cat gateway/logs/events.jsonl | jq`);
}

async function checkHealth(): Promise<boolean> {
  try {
    // Try to hit any endpoint to see if server is up
    await axios.get(`${GATEWAY_URL}/approvals`, { timeout: 2000 });
    console.log(`✅ Gateway is running on ${GATEWAY_URL}`);
    return true;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`❌ Gateway is not responding. Please start it first with:`);
      console.log(`   npm run start:gateway`);
      return false;
    }
    // If we get any response (even error), server is running
    console.log(`✅ Gateway is running on ${GATEWAY_URL}`);
    return true;
  }
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     Agent Runtime Security - Demo MVP                      ║
╚════════════════════════════════════════════════════════════╝
`);

  // Check if gateway is running
  const isHealthy = await checkHealth();
  if (!isHealthy) {
    process.exit(1);
  }

  await sleep(1000);

  // Test 1: ALLOW - Safe action in dev environment
  await testToolCall("Safe Dev Action", {
    request_id: uuidv4(),
    timestamp: new Date().toISOString(),
    agent: {
      agent_id: "agent-001",
      name: "TestAgent",
      owner: "demo@example.com",
      environment: "dev",
    },
    action: {
      type: "tool_call",
      tool_name: "query_database",
      tool_args: { query: "SELECT name FROM users LIMIT 10" },
    },
    context: {},
  });

  await sleep(500);

  // Test 2: DENY - Bulk export attempt
  await testToolCall("Blocked Bulk Export", {
    request_id: uuidv4(),
    timestamp: new Date().toISOString(),
    agent: {
      agent_id: "agent-002",
      name: "MaliciousAgent",
      owner: "attacker@example.com",
      environment: "prod",
    },
    action: {
      type: "tool_call",
      tool_name: "query_customer_db",
      tool_args: { query: "SELECT * FROM customers -- export all customers" },
    },
    context: {
      user_input: "Export all customers to CSV",
    },
  });

  await sleep(500);

  // Test 3: DENY - PCI data via email
  await testToolCall("Blocked PCI Email", {
    request_id: uuidv4(),
    timestamp: new Date().toISOString(),
    agent: {
      agent_id: "agent-003",
      name: "EmailAgent",
      owner: "support@example.com",
      environment: "prod",
    },
    action: {
      type: "tool_call",
      tool_name: "send_email",
      tool_args: {
        to: "external@company.com",
        subject: "Customer credit card details",
        body: "Here are the credit card numbers...",
      },
    },
    context: {
      data_labels: ["PCI"],
    },
  });

  await sleep(500);

  // Test 4: REQUIRE_APPROVAL - Payment in prod
  const approval_id_1 = await testToolCall("Payment Requiring Approval", {
    request_id: uuidv4(),
    timestamp: new Date().toISOString(),
    agent: {
      agent_id: "agent-004",
      name: "PaymentAgent",
      owner: "finance@example.com",
      environment: "prod",
    },
    action: {
      type: "tool_call",
      tool_name: "trigger_payment",
      tool_args: {
        amount: 1000,
        currency: "USD",
        recipient: "vendor@example.com",
      },
    },
    context: {},
  });

  await sleep(500);

  // Test 5: REQUIRE_APPROVAL - Email in prod
  const approval_id_2 = await testToolCall("Email Requiring Approval", {
    request_id: uuidv4(),
    timestamp: new Date().toISOString(),
    agent: {
      agent_id: "agent-005",
      name: "NotificationAgent",
      owner: "ops@example.com",
      environment: "prod",
    },
    action: {
      type: "tool_call",
      tool_name: "send_email",
      tool_args: {
        to: "customer@example.com",
        subject: "Account update",
        body: "Your account has been updated.",
      },
    },
    context: {},
  });

  await sleep(500);

  // List pending approvals
  await listPendingApprovals();

  await sleep(500);

  // Test approval workflow
  if (approval_id_1) {
    await testApproval(approval_id_1, true);
  }

  await sleep(500);

  if (approval_id_2) {
    await testApproval(approval_id_2, false);
  }

  await sleep(500);

  // Export audit log
  await exportAuditLog();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Demo completed! ✅`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
