#!/usr/bin/env ts-node

import { AgentSecurity } from "./core/src/sdk";
import { AgentActionRequest, Decision } from "./core/src/schemas";

/**
 * Agent Runtime Security SDK - Demo
 * 
 * This demo shows how to integrate the security SDK directly into your agent code.
 * No HTTP gateway required!
 */

// Track approval requests for demo purposes
const pendingApprovals: Array<{
  request: AgentActionRequest;
  decision: Decision;
  resolve: (approved: boolean) => void;
}> = [];

// Initialize the security SDK
const security = new AgentSecurity({
  policyPath: "./default-policy.json",
  defaultEnvironment: "dev",
  defaultOwner: "demo@example.com",
  
  // Custom approval handler - in real use, this would integrate with Slack, email, etc.
  onApprovalRequired: async (request, decision) => {
    console.log("\n⏳ APPROVAL REQUIRED");
    console.log(`  Tool: ${request.action.tool_name}`);
    console.log(`  Agent: ${request.agent.agent_id} (${request.agent.environment})`);
    console.log(`  Reason: ${decision.reasons[0]?.message}`);
    console.log(`  Approver Role: ${decision.approver_role || "any"}`);
    
    // Store for later processing
    return new Promise<boolean>((resolve) => {
      pendingApprovals.push({ request, decision, resolve });
    });
  },
  
  onDeny: (request, decision) => {
    console.log("\n❌ DENIED");
    console.log(`  Tool: ${request.action.tool_name}`);
    console.log(`  Agent: ${request.agent.agent_id}`);
    console.log(`  Reason: ${decision.reasons[0]?.message}`);
  },
  
  onAllow: (request, decision) => {
    console.log("\n✅ ALLOWED");
    console.log(`  Tool: ${request.action.tool_name}`);
    console.log(`  Agent: ${request.agent.agent_id}`);
    console.log(`  Reason: ${decision.reasons[0]?.message}`);
  },
  
  onAuditEvent: (event) => {
    // In production, you'd send this to your audit log storage
    console.log(`  📝 Event logged: ${event.event_id} (${event.outcome})`);
  },
});

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemo() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     Agent Runtime Security SDK - Demo                      ║
║     (No gateway required - direct SDK integration)         ║
╚════════════════════════════════════════════════════════════╝
`);

  await sleep(1000);

  // Test 1: ALLOW - Safe action in dev environment
  console.log("\n" + "=".repeat(60));
  console.log("Test 1: Safe Dev Action (should ALLOW)");
  console.log("=".repeat(60));
  
  const result1 = await security.checkToolCall({
    toolName: "query_database",
    toolArgs: { query: "SELECT name FROM users LIMIT 10" },
    agentId: "agent-001",
    agentName: "TestAgent",
    environment: "dev",
  });
  
  if (result1.allowed) {
    console.log("  ➜ Tool execution would proceed here");
  }

  await sleep(500);

  // Test 2: DENY - Bulk export attempt
  console.log("\n" + "=".repeat(60));
  console.log("Test 2: Bulk Export Attempt (should DENY)");
  console.log("=".repeat(60));
  
  const result2 = await security.checkToolCall({
    toolName: "query_customer_db",
    toolArgs: { query: "SELECT * FROM customers" },
    agentId: "agent-002",
    agentName: "MaliciousAgent",
    environment: "prod",
    userInput: "Export all customers to CSV",
  });
  
  if (!result2.allowed) {
    console.log("  ➜ Tool execution blocked");
  }

  await sleep(500);

  // Test 3: DENY - PCI data via email
  console.log("\n" + "=".repeat(60));
  console.log("Test 3: PCI Data Email (should DENY)");
  console.log("=".repeat(60));
  
  const result3 = await security.checkToolCall({
    toolName: "send_email",
    toolArgs: {
      to: "external@company.com",
      subject: "Customer credit card details",
      body: "Here are the credit card numbers...",
    },
    agentId: "agent-003",
    agentName: "EmailAgent",
    environment: "prod",
    dataLabels: ["PCI"],
  });
  
  if (!result3.allowed) {
    console.log("  ➜ Tool execution blocked");
  }

  await sleep(500);

  // Test 4: REQUIRE_APPROVAL - Payment in prod (will be in pending queue)
  console.log("\n" + "=".repeat(60));
  console.log("Test 4: Payment in Production (should require APPROVAL)");
  console.log("=".repeat(60));
  
  const result4Promise = security.checkToolCall({
    toolName: "trigger_payment",
    toolArgs: {
      amount: 1000,
      currency: "USD",
      recipient: "vendor@example.com",
    },
    agentId: "agent-004",
    agentName: "PaymentAgent",
    environment: "prod",
  });

  await sleep(500);

  // Test 5: REQUIRE_APPROVAL - Email in prod (will be in pending queue)
  console.log("\n" + "=".repeat(60));
  console.log("Test 5: Email in Production (should require APPROVAL)");
  console.log("=".repeat(60));
  
  const result5Promise = security.checkToolCall({
    toolName: "send_email",
    toolArgs: {
      to: "customer@example.com",
      subject: "Account update",
      body: "Your account has been updated.",
    },
    agentId: "agent-005",
    agentName: "NotificationAgent",
    environment: "prod",
  });

  await sleep(1000);

  // Process pending approvals
  console.log("\n" + "=".repeat(60));
  console.log(`Pending Approvals: ${pendingApprovals.length}`);
  console.log("=".repeat(60));
  
  if (pendingApprovals.length > 0) {
    pendingApprovals.forEach((approval, index) => {
      console.log(`\n${index + 1}. ${approval.request.action.tool_name}`);
      console.log(`   Agent: ${approval.request.agent.agent_id}`);
      console.log(`   Environment: ${approval.request.agent.environment}`);
      console.log(`   Approver: ${approval.decision.approver_role || "any"}`);
    });
  }

  await sleep(500);

  // Simulate approval workflow
  console.log("\n" + "=".repeat(60));
  console.log("Simulating Approval Workflow");
  console.log("=".repeat(60));

  if (pendingApprovals.length > 0) {
    // Approve the payment (first approval)
    console.log("\n✓ Approving payment request...");
    pendingApprovals[0].resolve(true);
    const result4 = await result4Promise;
    if (result4.allowed) {
      console.log("  ➜ Payment would be executed now");
    }

    await sleep(500);

    // Reject the email (second approval)
    if (pendingApprovals.length > 1) {
      console.log("\n✗ Rejecting email request...");
      pendingApprovals[1].resolve(false);
      const result5 = await result5Promise;
      if (!result5.allowed) {
        console.log("  ➜ Email sending blocked");
      }
    }
  }

  await sleep(500);

  // Show audit log summary
  console.log("\n" + "=".repeat(60));
  console.log("Audit Log Summary");
  console.log("=".repeat(60));
  
  const auditLog = security.getAuditLog();
  console.log(`\nTotal events: ${auditLog.length}`);
  
  const outcomes = auditLog.reduce((acc, event) => {
    acc[event.outcome] = (acc[event.outcome] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log("\nBy outcome:");
  Object.entries(outcomes).forEach(([outcome, count]) => {
    console.log(`  ${outcome}: ${count}`);
  });
  
  console.log("\nAll events:");
  auditLog.forEach((event, i) => {
    console.log(`  ${i + 1}. [${event.outcome}] ${event.tool_name} (${event.agent_id})`);
  });

  // Demonstrate the protect() wrapper
  console.log("\n" + "=".repeat(60));
  console.log("Bonus: Using protect() wrapper");
  console.log("=".repeat(60));

  // Mock email function
  const mockSendEmail = async (to: string, subject: string, body: string) => {
    return { success: true, messageId: "mock-123" };
  };

  // Wrap it with security
  const protectedSendEmail = security.protect(
    "send_email",
    mockSendEmail,
    {
      agentId: "protected-agent",
      environment: "dev",
      extractToolArgs: (to, subject, body) => ({ to, subject, body }),
    }
  );

  try {
    console.log("\nCalling protected function in dev environment...");
    const emailResult = await protectedSendEmail(
      "user@example.com",
      "Test",
      "Hello world"
    );
    console.log("✅ Email sent:", emailResult);
  } catch (error: any) {
    console.log("❌ Email blocked:", error.message);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Demo completed! ✅");
  console.log("=".repeat(60));
  console.log("\nKey Takeaways:");
  console.log("  • No HTTP gateway needed - SDK runs in-process");
  console.log("  • Custom approval callbacks for your workflow");
  console.log("  • Full audit trail captured");
  console.log("  • Easy to integrate with decorators/wrappers");
  console.log("  • Zero infrastructure to manage\n");
}

runDemo().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
