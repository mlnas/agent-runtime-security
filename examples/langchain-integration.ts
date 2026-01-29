/**
 * LangChain Integration Example
 * 
 * This example shows how to integrate the SDK with LangChain tools.
 */

import { AgentSecurity, SecurityError } from '../core/src/sdk';
import * as path from 'path';

// Initialize security
const security = new AgentSecurity({
  policyPath: path.join(__dirname, '../default-policy.json'),
  defaultEnvironment: 'prod'
});

/**
 * Base class for secure LangChain tools
 * 
 * Extend this instead of the regular Tool class to automatically
 * add security checks to all your tools.
 */
abstract class SecureTool {
  abstract name: string;
  abstract description: string;
  protected agentId: string = 'langchain-agent';
  protected environment: 'dev' | 'staging' | 'prod' = 'prod';

  /**
   * Implement your tool logic here
   */
  protected abstract executeInternal(input: string): Promise<string>;

  /**
   * This method is called by LangChain
   * It adds security checks before executing your tool
   */
  async call(input: string): Promise<string> {
    // Check security policy
    const result = await security.checkToolCall({
      toolName: this.name,
      toolArgs: { input },
      agentId: this.agentId,
      environment: this.environment,
      userInput: input
    });

    if (!result.allowed) {
      throw new SecurityError(
        `Security policy blocked ${this.name}: ${result.decision.reasons[0].message}`,
        result.decision
      );
    }

    // Execute the tool
    return await this.executeInternal(input);
  }
}

/**
 * Example: Email tool with security
 */
class EmailTool extends SecureTool {
  name = 'send_email';
  description = 'Send an email to a recipient';

  protected async executeInternal(input: string): Promise<string> {
    // Parse input, send email, return result
    console.log(`Sending email: ${input}`);
    return 'Email sent successfully';
  }
}

/**
 * Example: Database query tool with security
 */
class DatabaseTool extends SecureTool {
  name = 'query_database';
  description = 'Query the database';

  protected async executeInternal(input: string): Promise<string> {
    // Execute query, return results
    console.log(`Executing query: ${input}`);
    return JSON.stringify([{ id: 1, name: 'Alice' }]);
  }
}

/**
 * Example: Payment tool with security
 */
class PaymentTool extends SecureTool {
  name = 'trigger_payment';
  description = 'Trigger a payment transaction';

  protected async executeInternal(input: string): Promise<string> {
    // Process payment
    console.log(`Processing payment: ${input}`);
    return 'Payment processed successfully';
  }
}

async function main() {
  const emailTool = new EmailTool();
  const dbTool = new DatabaseTool();
  const paymentTool = new PaymentTool();

  console.log('=== Testing LangChain-style Tools with Security ===\n');

  // Test 1: Safe database query
  try {
    console.log('1. Safe query:');
    const result = await dbTool.call('SELECT * FROM users LIMIT 10');
    console.log('✓', result);
  } catch (error) {
    if (error instanceof SecurityError) {
      console.log('✗ Blocked:', error.message);
    }
  }

  console.log('\n');

  // Test 2: Dangerous query
  try {
    console.log('2. Dangerous query:');
    const result = await dbTool.call('DROP TABLE users');
    console.log('✓', result);
  } catch (error) {
    if (error instanceof SecurityError) {
      console.log('✗ Blocked:', error.message);
    }
  }

  console.log('\n');

  // Test 3: Payment (requires approval)
  try {
    console.log('3. Payment:');
    const result = await paymentTool.call('Pay $1000 to vendor@example.com');
    console.log('✓', result);
  } catch (error) {
    if (error instanceof SecurityError) {
      console.log('✗ Blocked:', error.message);
    }
  }

  console.log('\n');

  // Show audit trail
  const events = security.getAuditLog();
  console.log('=== Audit Trail ===');
  events.forEach((event, i) => {
    console.log(`${i + 1}. ${event.outcome}: ${event.tool_name}`);
  });
}

main();
