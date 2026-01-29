/**
 * Agent Runtime Security - Core SDK
 * 
 * Open-source SDK for adding runtime security policies to AI agents.
 * 
 * @example
 * ```typescript
 * import { AgentSecurity } from '@agent-security/core';
 * 
 * const security = new AgentSecurity({
 *   policyPath: './policy.json',
 *   onApprovalRequired: async (request) => {
 *     return await askManager(request);
 *   }
 * });
 * 
 * const result = await security.checkToolCall({
 *   toolName: 'send_email',
 *   toolArgs: { to: 'user@example.com' },
 *   agentId: 'my-agent',
 *   environment: 'prod'
 * });
 * ```
 */

export * from "./schemas";
export * from "./loader";
export * from "./evaluator";
export * from "./events";
export * from "./default-policy";
export * from "./sdk";