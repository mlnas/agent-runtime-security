/**
 * Agent Runtime Security - Core SDK
 *
 * Open-source SDK for adding runtime security policies to AI agents.
 * Features a plugin architecture with lifecycle hooks for extensibility.
 *
 * @example
 * ```typescript
 * import { AgentSecurity } from '@agent-security/core';
 * import { killSwitch, rateLimiter } from '@agent-security/core/plugins';
 *
 * const security = new AgentSecurity({
 *   policyPath: './policy.json',
 *   plugins: [killSwitch(), rateLimiter({ maxPerMinute: 60 })],
 *   approvalTimeoutMs: 300_000,
 * });
 * ```
 */

// Core
export * from "./schemas";
export * from "./loader";
export * from "./evaluator";
export * from "./events";
export * from "./default-policy";
export * from "./sdk";

// Built-in plugins (re-exported for convenience)
export { killSwitch } from "./plugins/kill-switch";
export { rateLimiter } from "./plugins/rate-limiter";
export { sessionContext } from "./plugins/session-context";
export { outputValidator } from "./plugins/output-validator";

export type { KillSwitchPlugin, KillSwitchConfig, KillSwitchState } from "./plugins/kill-switch";
export type { RateLimiterConfig, RateLimiterPlugin } from "./plugins/rate-limiter";
export type { SessionContextConfig, SessionContextPlugin } from "./plugins/session-context";
export type { OutputValidatorConfig, OutputValidatorPlugin, OutputViolation } from "./plugins/output-validator";
