import { SecurityPlugin, BeforeCheckContext, PluginResult, Decision } from "../schemas";

/**
 * Rate Limiter Plugin
 *
 * Enforces per-agent, per-tool, or global rate limits using a sliding
 * window algorithm. Calls that exceed the limit are immediately denied.
 *
 * @example
 * ```typescript
 * const security = new AgentSecurity({
 *   policyPath: './policy.json',
 *   plugins: [
 *     rateLimiter({
 *       maxPerMinute: 60,            // Global limit per agent
 *       maxPerMinutePerTool: 20,     // Per-tool limit per agent
 *     })
 *   ]
 * });
 * ```
 */
export interface RateLimiterConfig {
  /** Maximum calls per minute per agent (0 = unlimited) */
  maxPerMinute?: number;
  /** Maximum calls per minute per agent per tool (0 = unlimited) */
  maxPerMinutePerTool?: number;
  /** Window size in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
}

export interface RateLimiterPlugin extends SecurityPlugin {
  /** Get current call count for an agent */
  getCount(agentId: string): number;
  /** Get current call count for an agent + tool combination */
  getToolCount(agentId: string, toolName: string): number;
  /** Reset all rate limit counters */
  reset(): void;
  /** Reset counters for a specific agent */
  resetAgent(agentId: string): void;
}

interface TimestampEntry {
  timestamps: number[];
}

export function rateLimiter(config: RateLimiterConfig = {}): RateLimiterPlugin {
  const maxPerMinute = config.maxPerMinute ?? 0;
  const maxPerMinutePerTool = config.maxPerMinutePerTool ?? 0;
  const windowMs = config.windowMs ?? 60_000;

  // agentId -> timestamps
  const agentCounts = new Map<string, TimestampEntry>();
  // `${agentId}:${toolName}` -> timestamps
  const toolCounts = new Map<string, TimestampEntry>();

  function pruneOld(entry: TimestampEntry, now: number): void {
    const cutoff = now - windowMs;
    // Remove timestamps older than the window
    while (entry.timestamps.length > 0 && entry.timestamps[0] < cutoff) {
      entry.timestamps.shift();
    }
  }

  function getOrCreate(map: Map<string, TimestampEntry>, key: string): TimestampEntry {
    let entry = map.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      map.set(key, entry);
    }
    return entry;
  }

  const plugin: RateLimiterPlugin = {
    name: "rate-limiter",
    version: "1.0.0",

    async beforeCheck(context: BeforeCheckContext): Promise<PluginResult | void> {
      const now = Date.now();
      const agentId = context.request.agent.agent_id;
      const toolName = context.request.action.tool_name;

      // Check per-agent limit
      if (maxPerMinute > 0) {
        const entry = getOrCreate(agentCounts, agentId);
        pruneOld(entry, now);

        if (entry.timestamps.length >= maxPerMinute) {
          return {
            decision: denyDecision(
              "RATE_LIMIT_AGENT",
              `Agent ${agentId} exceeded ${maxPerMinute} calls per ${windowMs / 1000}s`
            ),
          };
        }
      }

      // Check per-agent-per-tool limit
      if (maxPerMinutePerTool > 0) {
        const key = `${agentId}:${toolName}`;
        const entry = getOrCreate(toolCounts, key);
        pruneOld(entry, now);

        if (entry.timestamps.length >= maxPerMinutePerTool) {
          return {
            decision: denyDecision(
              "RATE_LIMIT_TOOL",
              `Agent ${agentId} exceeded ${maxPerMinutePerTool} calls per ${windowMs / 1000}s for tool ${toolName}`
            ),
          };
        }
      }

      // Record the call (only if not rate-limited)
      if (maxPerMinute > 0) {
        getOrCreate(agentCounts, agentId).timestamps.push(now);
      }
      if (maxPerMinutePerTool > 0) {
        getOrCreate(toolCounts, `${agentId}:${toolName}`).timestamps.push(now);
      }
    },

    getCount(agentId: string): number {
      const entry = agentCounts.get(agentId);
      if (!entry) return 0;
      pruneOld(entry, Date.now());
      return entry.timestamps.length;
    },

    getToolCount(agentId: string, toolName: string): number {
      const entry = toolCounts.get(`${agentId}:${toolName}`);
      if (!entry) return 0;
      pruneOld(entry, Date.now());
      return entry.timestamps.length;
    },

    reset(): void {
      agentCounts.clear();
      toolCounts.clear();
    },

    resetAgent(agentId: string): void {
      agentCounts.delete(agentId);
      // Also clear tool-level entries for this agent
      for (const key of toolCounts.keys()) {
        if (key.startsWith(`${agentId}:`)) {
          toolCounts.delete(key);
        }
      }
    },
  };

  return plugin;
}

function denyDecision(code: string, message: string): Decision {
  return {
    outcome: "DENY",
    reasons: [{ code, message }],
  };
}
