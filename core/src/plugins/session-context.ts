import { SecurityPlugin, BeforeCheckContext, PluginResult, Decision } from "../schemas";

/**
 * Session Context Plugin
 *
 * Tracks state across multiple calls within a session or conversation.
 * Can enforce limits like "max 3 payments per session" or track
 * cumulative behavior patterns.
 *
 * @example
 * ```typescript
 * const session = sessionContext({
 *   limits: {
 *     'trigger_payment': { maxPerSession: 3 },
 *     'send_email':      { maxPerSession: 10 },
 *   },
 *   sessionTtlMs: 3600_000, // 1 hour
 * });
 *
 * const security = new AgentSecurity({
 *   policyPath: './policy.json',
 *   plugins: [session]
 * });
 * ```
 */
export interface SessionContextConfig {
  /** Per-tool limits within a session */
  limits?: Record<string, { maxPerSession: number }>;
  /** Session TTL in milliseconds (default: 3600_000 = 1 hour) */
  sessionTtlMs?: number;
}

export interface SessionContextPlugin extends SecurityPlugin {
  /** Get the call count for a tool within a session */
  getSessionToolCount(sessionId: string, toolName: string): number;
  /** Get all tool counts for a session */
  getSessionSummary(sessionId: string): Record<string, number>;
  /** Clear a specific session */
  clearSession(sessionId: string): void;
  /** Clear all sessions */
  clearAll(): void;
}

interface SessionData {
  toolCounts: Map<string, number>;
  createdAt: number;
}

export function sessionContext(config: SessionContextConfig = {}): SessionContextPlugin {
  const limits = config.limits || {};
  const sessionTtlMs = config.sessionTtlMs ?? 3_600_000;
  const sessions = new Map<string, SessionData>();

  function getSession(sessionId: string): SessionData {
    const now = Date.now();
    let session = sessions.get(sessionId);

    // Create new session or refresh expired one
    if (!session || now - session.createdAt > sessionTtlMs) {
      session = { toolCounts: new Map(), createdAt: now };
      sessions.set(sessionId, session);
    }

    return session;
  }

  // Periodic cleanup of expired sessions
  function cleanup(): void {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.createdAt > sessionTtlMs) {
        sessions.delete(id);
      }
    }
  }

  const plugin: SessionContextPlugin = {
    name: "session-context",
    version: "1.0.0",

    async beforeCheck(context: BeforeCheckContext): Promise<PluginResult | void> {
      const sessionId = context.request.context.session_id;
      if (!sessionId) return; // No session tracking without a session ID

      const toolName = context.request.action.tool_name;
      const limit = limits[toolName];

      if (!limit) return; // No limit configured for this tool

      const session = getSession(sessionId);
      const currentCount = session.toolCounts.get(toolName) || 0;

      if (currentCount >= limit.maxPerSession) {
        return {
          decision: {
            outcome: "DENY",
            reasons: [
              {
                code: "SESSION_LIMIT_EXCEEDED",
                message: `Tool ${toolName} has been called ${currentCount} times in this session (max: ${limit.maxPerSession})`,
              },
            ],
          },
        };
      }

      // Increment the count
      session.toolCounts.set(toolName, currentCount + 1);

      // Occasional cleanup
      if (Math.random() < 0.01) cleanup();
    },

    getSessionToolCount(sessionId: string, toolName: string): number {
      const session = sessions.get(sessionId);
      if (!session) return 0;
      return session.toolCounts.get(toolName) || 0;
    },

    getSessionSummary(sessionId: string): Record<string, number> {
      const session = sessions.get(sessionId);
      if (!session) return {};
      const summary: Record<string, number> = {};
      for (const [tool, count] of session.toolCounts) {
        summary[tool] = count;
      }
      return summary;
    },

    clearSession(sessionId: string): void {
      sessions.delete(sessionId);
    },

    clearAll(): void {
      sessions.clear();
    },
  };

  return plugin;
}
