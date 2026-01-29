/**
 * Protect Wrapper Example
 * 
 * This example shows how to use the protect() wrapper to automatically
 * add security checks to existing functions.
 */

import { AgentSecurity, SecurityError } from '../core/src/sdk';
import * as path from 'path';

// Initialize SDK
const security = new AgentSecurity({
  policyPath: path.join(__dirname, '../default-policy.json'),
  defaultEnvironment: 'prod'
});

// Your existing tool functions
async function sendEmailOriginal(to: string, subject: string, body: string) {
  console.log(`Sending email to ${to}...`);
  return { success: true, messageId: 'msg-123' };
}

async function queryDatabaseOriginal(query: string) {
  console.log(`Executing query: ${query}`);
  return { rows: [{ id: 1, name: 'Alice' }] };
}

async function triggerPaymentOriginal(amount: number, recipient: string) {
  console.log(`Processing payment of $${amount} to ${recipient}...`);
  return { transactionId: 'txn-456', status: 'completed' };
}

// Wrap them with security checks
const sendEmail = security.protect(
  'send_email',
  sendEmailOriginal,
  {
    agentId: 'email-agent',
    environment: 'prod',
    extractToolArgs: (to, subject, body) => ({ to, subject, body })
  }
);

const queryDatabase = security.protect(
  'query_database',
  queryDatabaseOriginal,
  {
    agentId: 'db-agent',
    environment: 'prod',
    extractToolArgs: (query) => ({ query })
  }
);

const triggerPayment = security.protect(
  'trigger_payment',
  triggerPaymentOriginal,
  {
    agentId: 'payment-agent',
    environment: 'prod',
    extractToolArgs: (amount, recipient) => ({ amount, recipient })
  }
);

async function main() {
  console.log('=== Testing Protected Functions ===\n');

  // Test 1: Safe query (should work)
  try {
    console.log('1. Safe database query:');
    const result1 = await queryDatabase('SELECT * FROM users LIMIT 10');
    console.log('✓ Success:', result1);
  } catch (error) {
    if (error instanceof SecurityError) {
      console.log('✗ Blocked:', error.message);
    }
  }

  console.log('\n');

  // Test 2: Dangerous query (should be blocked)
  try {
    console.log('2. Dangerous database query:');
    const result2 = await queryDatabase('DROP TABLE users');
    console.log('✓ Success:', result2);
  } catch (error) {
    if (error instanceof SecurityError) {
      console.log('✗ Blocked:', error.message);
      console.log('   Reason:', error.decision.reasons[0].message);
    }
  }

  console.log('\n');

  // Test 3: Email (may require approval)
  try {
    console.log('3. Send email in production:');
    const result3 = await sendEmail(
      'customer@example.com',
      'Welcome',
      'Thanks for signing up!'
    );
    console.log('✓ Success:', result3);
  } catch (error) {
    if (error instanceof SecurityError) {
      console.log('✗ Blocked:', error.message);
    }
  }

  console.log('\n=== Audit Trail ===\n');
  const events = security.getAuditLog();
  events.forEach((event, i) => {
    console.log(`${i + 1}. ${event.outcome}: ${event.tool_name}`);
  });
}

main();
