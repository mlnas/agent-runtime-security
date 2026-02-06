/**
 * Built-in Plugins for Agent Runtime Security SDK
 *
 * All plugins are optional and tree-shakeable.
 * Import only what you need:
 *
 * ```typescript
 * import { killSwitch, rateLimiter } from '@agent-security/core/plugins';
 * ```
 */

export { killSwitch } from "./kill-switch";
export type { KillSwitchPlugin } from "./kill-switch";

export { rateLimiter } from "./rate-limiter";
export type { RateLimiterConfig, RateLimiterPlugin } from "./rate-limiter";

export { sessionContext } from "./session-context";
export type { SessionContextConfig, SessionContextPlugin } from "./session-context";

export { outputValidator } from "./output-validator";
export type {
  OutputValidatorConfig,
  OutputValidatorPlugin,
  OutputViolation,
} from "./output-validator";
