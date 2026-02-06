import { v4 as uuidv4 } from "uuid";
import {
  AgentActionRequest,
  Decision,
  Event,
  SecurityPlugin,
  AfterExecutionContext,
  PluginResult,
  PolicyBundle,
} from "./schemas";
import { PolicyBundleLoader } from "./loader";
import { PolicyEvaluator } from "./evaluator";
import { createEvent } from "./events";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default max audit log size (entries). */
const DEFAULT_MAX_AUDIT_LOG_SIZE = 10_000;

/**
 * SDK configuration options.
 */
export interface AgentSecurityConfig {
  // -- Policy sources (at least one required for sync init; or use `init()`) --

  /** Path to a policy bundle JSON file (sync) */
  policyPath?: string;
  /** Policy bundle as a JSON string (sync) */
  policyJson?: string;
  /** Policy bundle object (sync) */
  policyBundle?: PolicyBundle;
  /** Async loader function — call `await security.init()` after construction */
  policyLoader?: () => Promise<PolicyBundle | string>;

  // -- Plugins --

  /** Array of plugins to register */
  plugins?: SecurityPlugin[];

  // -- Callbacks --

  /** Called when an action requires approval. Return true to approve. */
  onApprovalRequired?: (request: AgentActionRequest, decision: Decision) => Promise<boolean>;
  /** Called when an action is denied */
  onDeny?: (request: AgentActionRequest, decision: Decision) => void;
  /** Called when an action is allowed */
  onAllow?: (request: AgentActionRequest, decision: Decision) => void;
  /** Called for every audit event */
  onAuditEvent?: (event: Event) => void;
  /** Called when a plugin or callback throws an error */
  onError?: (error: Error, context: string) => void;

  // -- Defaults --

  /** Default agent environment */
  defaultEnvironment?: string;
  /** Default agent owner */
  defaultOwner?: string;
  /** Timeout (ms) for approval callbacks. 0 = no timeout. */
  approvalTimeoutMs?: number;
  /**
   * Maximum number of audit events to retain in memory.
   * When exceeded, oldest events are evicted (FIFO).
   * Default: 10,000. Set to 0 for unlimited (not recommended).
   */
  maxAuditLogSize?: number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * Result of a security check.
 */
export interface SecurityCheckResult {
  allowed: boolean;
  decision: Decision;
  event: Event;
}

// ---------------------------------------------------------------------------
// Concurrency lock
// ---------------------------------------------------------------------------

/**
 * Lightweight async mutex to serialize critical sections.
 * Prevents TOCTOU races in rate limiter and session context plugins.
 */
class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

// ---------------------------------------------------------------------------
// AgentSecurity — main SDK entry point
// ---------------------------------------------------------------------------

/**
 * Agent Security SDK Client.
 *
 * Provides runtime security enforcement for AI agent tool calls via a
 * configurable plugin pipeline:
 *
 *   Phase 1: beforeCheck   → Plugins (kill switch, rate limiting, …)
 *   Phase 2: evaluate      → Core policy engine
 *   Phase 3: afterDecision → Plugins (timeouts, overrides, …)
 *   Phase 4: callbacks     → onAllow / onDeny / onApprovalRequired
 *   Phase 5: afterExecution → Plugins (output validation — protect() only)
 *
 * Security model:
 *   - Plugins default to fail-closed (DENY on error) unless `failOpen: true`
 *   - Audit log is bounded to prevent memory exhaustion
 *   - Approval timeouts clean up properly (no dangling timers)
 *   - Plugin pipeline is serialized to prevent TOCTOU races
 *
 * @example
 * ```typescript
 * import { AgentSecurity, killSwitch, rateLimiter } from '@agent-security/core';
 *
 * const security = new AgentSecurity({
 *   policyPath: './policy.json',
 *   plugins: [
 *     killSwitch(),
 *     rateLimiter({ maxPerMinute: 30 }),
 *   ],
 *   onApprovalRequired: async (req) => askManager(req),
 *   approvalTimeoutMs: 300_000,
 * });
 *
 * const result = await security.checkToolCall({
 *   toolName: 'send_email',
 *   toolArgs: { to: 'user@example.com' },
 *   agentId: 'my-agent',
 *   environment: 'prod',
 * });
 * ```
 */
export class AgentSecurity {
  private evaluator!: PolicyEvaluator;
  private config: AgentSecurityConfig;
  private plugins: SecurityPlugin[] = [];
  private auditLog: Event[] = [];
  private maxAuditLogSize: number;
  private initialized = false;
  private mutex = new AsyncMutex();

  constructor(config: AgentSecurityConfig) {
    this.config = config;
    this.maxAuditLogSize = config.maxAuditLogSize ?? DEFAULT_MAX_AUDIT_LOG_SIZE;

    // Register plugins
    if (config.plugins) {
      this.plugins = [...config.plugins];
    }

    // Load policy synchronously if a sync source is available
    if (config.policyPath) {
      const bundle = PolicyBundleLoader.loadFromFile(config.policyPath);
      this.evaluator = new PolicyEvaluator(bundle);
      this.initialized = true;
    } else if (config.policyJson) {
      const bundle = PolicyBundleLoader.loadFromString(config.policyJson);
      this.evaluator = new PolicyEvaluator(bundle);
      this.initialized = true;
    } else if (config.policyBundle) {
      const bundle = PolicyBundleLoader.loadFromObject(config.policyBundle);
      this.evaluator = new PolicyEvaluator(bundle);
      this.initialized = true;
    } else if (!config.policyLoader) {
      throw new Error(
        "AgentSecurity requires policyPath, policyJson, policyBundle, or policyLoader"
      );
    }
  }

  /**
   * Async initializer — required when using `policyLoader`.
   * Also initializes all registered plugins.
   */
  async init(): Promise<void> {
    // Load policy asynchronously if needed
    if (!this.initialized && this.config.policyLoader) {
      const bundle = await PolicyBundleLoader.loadAsync(this.config.policyLoader);
      this.evaluator = new PolicyEvaluator(bundle);
      this.initialized = true;
    }

    // Initialize plugins
    for (const plugin of this.plugins) {
      if (plugin.initialize) {
        await plugin.initialize();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Core: checkToolCall
  // -----------------------------------------------------------------------

  /**
   * Check if a tool call is allowed by the security policy and plugin pipeline.
   *
   * The pipeline is serialized via an async mutex to prevent TOCTOU races
   * in stateful plugins (rate limiter, session context).
   */
  async checkToolCall(params: {
    toolName: string;
    toolArgs: Record<string, any>;
    agentId: string;
    agentName?: string;
    environment?: string;
    owner?: string;
    actionType?: string;
    userInput?: string;
    dataLabels?: string[];
    riskHints?: string[];
    sessionId?: string;
    parentAgentId?: string;
  }): Promise<SecurityCheckResult> {
    this.ensureInitialized();

    // Serialize through the mutex to prevent concurrent TOCTOU races
    await this.mutex.acquire();
    try {
      return await this.executeCheckPipeline(params);
    } finally {
      this.mutex.release();
    }
  }

  /**
   * Internal: execute the full check pipeline (phases 1–4).
   */
  private async executeCheckPipeline(params: {
    toolName: string;
    toolArgs: Record<string, any>;
    agentId: string;
    agentName?: string;
    environment?: string;
    owner?: string;
    actionType?: string;
    userInput?: string;
    dataLabels?: string[];
    riskHints?: string[];
    sessionId?: string;
    parentAgentId?: string;
  }): Promise<SecurityCheckResult> {
    // Build request
    let request: AgentActionRequest = this.buildRequest(params);

    // === Phase 1: beforeCheck plugins ===
    for (const plugin of this.plugins) {
      if (plugin.beforeCheck) {
        try {
          const result = await plugin.beforeCheck({ request });
          if (result?.decision) {
            // Plugin short-circuited — return immediately
            const event = createEvent(request, result.decision, plugin.name);
            this.recordEvent(event);
            return {
              allowed: result.decision.outcome === "ALLOW",
              decision: result.decision,
              event,
            };
          }
          if (result?.modifiedRequest) {
            request = result.modifiedRequest;
          }
        } catch (err) {
          const errorResult = this.handlePluginError(err as Error, plugin, request, "beforeCheck");
          if (errorResult) return errorResult; // fail-closed: DENY
          // fail-open: continue to next plugin
        }
      }
    }

    // === Phase 2: Core policy evaluation ===
    let decision = this.evaluator.evaluate(request);

    // === Phase 3: afterDecision plugins ===
    for (const plugin of this.plugins) {
      if (plugin.afterDecision) {
        try {
          const result = await plugin.afterDecision({ request, decision });
          if (result?.decision) {
            decision = result.decision;
          }
        } catch (err) {
          const errorResult = this.handlePluginError(err as Error, plugin, request, "afterDecision");
          if (errorResult) return errorResult; // fail-closed: DENY
          // fail-open: continue to next plugin
        }
      }
    }

    // Create primary audit event
    const event = createEvent(request, decision);
    this.recordEvent(event);

    // === Phase 4: Decision callbacks ===
    const allowed = await this.handleDecision(request, decision);

    return { allowed, decision, event };
  }

  // -----------------------------------------------------------------------
  // protect() — function wrapper with afterExecution hook
  // -----------------------------------------------------------------------

  /**
   * Wrap an async function with automatic security checks and output validation.
   * Preserves full request context through to Phase 5 (afterExecution).
   */
  protect<TArgs extends any[], TReturn>(
    toolName: string,
    fn: (...args: TArgs) => Promise<TReturn>,
    options?: {
      agentId?: string;
      agentName?: string;
      environment?: string;
      owner?: string;
      sessionId?: string;
      extractToolArgs?: (...args: TArgs) => Record<string, any>;
    }
  ): (...args: TArgs) => Promise<TReturn> {
    return async (...args: TArgs): Promise<TReturn> => {
      const toolArgs = options?.extractToolArgs
        ? options.extractToolArgs(...args)
        : { args };

      const agentId = options?.agentId || "protected-function";
      const environment = options?.environment || this.config.defaultEnvironment || "dev";
      const owner = options?.owner || this.config.defaultOwner || "unknown";
      const agentName = options?.agentName || agentId;

      const checkResult = await this.checkToolCall({
        toolName,
        toolArgs,
        agentId,
        agentName,
        environment,
        owner,
        sessionId: options?.sessionId,
      });

      if (!checkResult.allowed) {
        throw new SecurityError(
          `Security policy blocked execution of ${toolName}`,
          checkResult.decision
        );
      }

      // Build the full request object for Phase 5 (preserving all context)
      const fullRequest: AgentActionRequest = {
        request_id: checkResult.event.request_id,
        timestamp: checkResult.event.timestamp,
        agent: {
          agent_id: agentId,
          name: agentName,
          owner,
          environment,
        },
        action: {
          type: "tool_call",
          tool_name: toolName,
          tool_args: toolArgs,
        },
        context: {
          session_id: options?.sessionId,
        },
      };

      // Execute the function
      let result: TReturn;
      let execError: Error | undefined;

      try {
        result = await fn(...args);
      } catch (err) {
        execError = err as Error;
        throw err;
      } finally {
        // === Phase 5: afterExecution plugins ===
        await this.executeAfterExecution({
          request: fullRequest,
          decision: checkResult.decision,
          result: execError ? undefined : result!,
          error: execError,
        });
      }

      return result!;
    };
  }

  /**
   * Execute Phase 5 afterExecution plugins.
   */
  private async executeAfterExecution(context: AfterExecutionContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.afterExecution) {
        try {
          await plugin.afterExecution(context);
        } catch (err) {
          this.reportError(err as Error, `plugin:${plugin.name}:afterExecution`);
          // afterExecution errors are non-fatal (tool already ran)
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Plugin management
  // -----------------------------------------------------------------------

  /**
   * Register a plugin at runtime.
   */
  async registerPlugin(plugin: SecurityPlugin): Promise<void> {
    this.plugins.push(plugin);
    if (plugin.initialize) {
      await plugin.initialize();
    }
  }

  /**
   * Unregister a plugin by name.
   */
  async unregisterPlugin(name: string): Promise<void> {
    const idx = this.plugins.findIndex((p) => p.name === name);
    if (idx >= 0) {
      const plugin = this.plugins[idx];
      if (plugin.destroy) {
        await plugin.destroy();
      }
      this.plugins.splice(idx, 1);
    }
  }

  /**
   * Get a registered plugin by name.
   */
  getPlugin<T extends SecurityPlugin>(name: string): T | undefined {
    return this.plugins.find((p) => p.name === name) as T | undefined;
  }

  // -----------------------------------------------------------------------
  // Audit log
  // -----------------------------------------------------------------------

  getAuditLog(): Event[] {
    return [...this.auditLog];
  }

  clearAuditLog(): void {
    this.auditLog = [];
  }

  // -----------------------------------------------------------------------
  // Policy management
  // -----------------------------------------------------------------------

  getPolicyBundle(): PolicyBundle {
    this.ensureInitialized();
    return this.evaluator.getPolicyBundle();
  }

  reloadPolicy(policyPath?: string, policyJson?: string): void {
    if (policyPath) {
      this.evaluator.updatePolicyBundle(PolicyBundleLoader.loadFromFile(policyPath));
    } else if (policyJson) {
      this.evaluator.updatePolicyBundle(PolicyBundleLoader.loadFromString(policyJson));
    } else if (this.config.policyPath) {
      this.evaluator.updatePolicyBundle(PolicyBundleLoader.loadFromFile(this.config.policyPath));
    } else {
      throw new Error("No policy source specified for reload");
    }
  }

  async reloadPolicyAsync(loader?: () => Promise<PolicyBundle | string>): Promise<void> {
    const fn = loader || this.config.policyLoader;
    if (!fn) throw new Error("No async policy loader available");
    const bundle = await PolicyBundleLoader.loadAsync(fn);
    this.evaluator.updatePolicyBundle(bundle);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Gracefully shut down the SDK and all plugins.
   */
  async shutdown(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.destroy) {
        await plugin.destroy();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "AgentSecurity is not initialized. Call `await security.init()` when using policyLoader."
      );
    }
  }

  /**
   * Build an AgentActionRequest from check params.
   */
  private buildRequest(params: {
    toolName: string;
    toolArgs: Record<string, any>;
    agentId: string;
    agentName?: string;
    environment?: string;
    owner?: string;
    actionType?: string;
    userInput?: string;
    dataLabels?: string[];
    riskHints?: string[];
    sessionId?: string;
    parentAgentId?: string;
  }): AgentActionRequest {
    return {
      request_id: uuidv4(),
      timestamp: new Date().toISOString(),
      agent: {
        agent_id: params.agentId,
        name: params.agentName || params.agentId,
        owner: params.owner || this.config.defaultOwner || "unknown",
        environment: params.environment || this.config.defaultEnvironment || "dev",
      },
      action: {
        type: params.actionType || "tool_call",
        tool_name: params.toolName,
        tool_args: params.toolArgs,
      },
      context: {
        user_input: params.userInput,
        data_labels: params.dataLabels,
        risk_hints: params.riskHints,
        session_id: params.sessionId,
        parent_agent_id: params.parentAgentId,
      },
    };
  }

  /**
   * Record an audit event. Enforces max log size (FIFO eviction).
   */
  private recordEvent(event: Event): void {
    this.auditLog.push(event);

    // Evict oldest events when the log exceeds the max size
    if (this.maxAuditLogSize > 0 && this.auditLog.length > this.maxAuditLogSize) {
      const overage = this.auditLog.length - this.maxAuditLogSize;
      this.auditLog.splice(0, overage);
    }

    if (this.config.onAuditEvent) {
      try {
        this.config.onAuditEvent(event);
      } catch (err) {
        this.reportError(err as Error, "onAuditEvent");
      }
    }
  }

  /**
   * Handle a plugin error according to its failOpen setting.
   *
   * - failOpen: true  → returns null (caller should continue to next plugin)
   * - failOpen: false → returns SecurityCheckResult with DENY (caller should return it)
   *
   * Security-critical plugins (kill switch, rate limiter) default to fail-closed
   * so that a crash can't silently bypass protections.
   */
  private handlePluginError(
    error: Error,
    plugin: SecurityPlugin,
    request: AgentActionRequest,
    phase: string
  ): SecurityCheckResult | null {
    this.reportError(error, `plugin:${plugin.name}:${phase}`);

    if (plugin.failOpen) {
      // Fail-open: swallow error, caller continues to next plugin
      return null;
    }

    // Fail-closed: deny the request
    const decision: Decision = {
      outcome: "DENY",
      reasons: [
        {
          code: "PLUGIN_ERROR",
          message: `Plugin "${plugin.name}" failed during ${phase}: ${error.message}`,
        },
      ],
    };
    const event = createEvent(request, decision, plugin.name);
    this.recordEvent(event);
    return { allowed: false, decision, event };
  }

  /**
   * Report an error via the onError callback without affecting control flow.
   */
  private reportError(error: Error, context: string): void {
    if (this.config.onError) {
      try {
        this.config.onError(error, context);
      } catch {
        // Prevent error callback from crashing the SDK
      }
    }
  }

  /**
   * Handle ALLOW / DENY / REQUIRE_APPROVAL decision + callbacks.
   */
  private async handleDecision(
    request: AgentActionRequest,
    decision: Decision
  ): Promise<boolean> {
    switch (decision.outcome) {
      case "ALLOW":
        this.safeCallback(() => this.config.onAllow?.(request, decision));
        return true;

      case "DENY":
        this.safeCallback(() => this.config.onDeny?.(request, decision));
        return false;

      case "REQUIRE_APPROVAL":
        return this.handleApproval(request, decision);

      default:
        return false;
    }
  }

  /**
   * Handle the approval flow with optional timeout.
   * Properly cleans up the timer to avoid dangling references.
   */
  private async handleApproval(
    request: AgentActionRequest,
    decision: Decision
  ): Promise<boolean> {
    if (!this.config.onApprovalRequired) {
      // No approval callback — default to deny
      this.safeCallback(() => this.config.onDeny?.(request, decision));
      return false;
    }

    try {
      const timeoutMs = this.config.approvalTimeoutMs;
      let approved: boolean;

      if (timeoutMs && timeoutMs > 0) {
        // Race the approval callback against a timeout, with proper cleanup
        approved = await this.raceWithTimeout(
          this.config.onApprovalRequired(request, decision),
          timeoutMs,
          "Approval timed out"
        );
      } else {
        approved = await this.config.onApprovalRequired(request, decision);
      }

      // Log the approval decision
      const approvalEvent = createEvent(request, {
        ...decision,
        outcome: approved ? "ALLOW" : "DENY",
        reasons: [
          ...decision.reasons,
          {
            code: approved ? "APPROVED" : "REJECTED",
            message: approved
              ? "Request approved via callback"
              : "Request rejected via callback",
          },
        ],
      });
      this.recordEvent(approvalEvent);

      return approved;
    } catch (err) {
      // Timeout or callback error — deny and log
      const timeoutEvent = createEvent(request, {
        outcome: "DENY",
        reasons: [
          ...decision.reasons,
          {
            code: "APPROVAL_TIMEOUT",
            message: `Approval failed: ${(err as Error).message}`,
          },
        ],
      });
      this.recordEvent(timeoutEvent);
      this.reportError(err as Error, "onApprovalRequired");
      return false;
    }
  }

  /**
   * Race a promise against a timeout, cleaning up the timer when the promise resolves.
   * Prevents dangling setTimeout references.
   */
  private raceWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timer);
    });
  }

  private safeCallback(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.reportError(err as Error, "callback");
    }
  }
}

// ---------------------------------------------------------------------------
// SecurityError
// ---------------------------------------------------------------------------

/**
 * Custom error thrown when a security policy blocks an action.
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly decision: Decision
  ) {
    super(message);
    this.name = "SecurityError";
  }
}
