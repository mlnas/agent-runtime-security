import { SecurityPlugin, BeforeCheckContext, PluginResult, Decision } from "../schemas";

/**
 * Kill Switch Plugin
 *
 * Provides an emergency stop mechanism for individual agents or globally.
 * When an agent is killed, all its tool calls are immediately denied
 * without reaching the policy engine.
 *
 * Defaults to fail-closed (failOpen: false) so that if the plugin itself
 * errors, the agent is denied rather than allowed through.
 *
 * Supports optional persistence callbacks so kill state survives process restarts.
 *
 * @example
 * ```typescript
 * const ks = killSwitch({
 *   // Optional: persist kill state to external store
 *   onStateChange: async (state) => {
 *     await redis.set('kill-switch-state', JSON.stringify(state));
 *   },
 *   // Optional: restore state on init
 *   loadState: async () => {
 *     const raw = await redis.get('kill-switch-state');
 *     return raw ? JSON.parse(raw) : undefined;
 *   },
 * });
 *
 * const security = new AgentSecurity({
 *   policyPath: './policy.json',
 *   plugins: [ks]
 * });
 *
 * ks.kill('rogue-agent-001');
 * ```
 */
export interface KillSwitchConfig {
  /**
   * Called whenever kill state changes.
   * Use to persist state to an external store (Redis, database, file, etc.).
   */
  onStateChange?: (state: KillSwitchState) => void | Promise<void>;

  /**
   * Called during plugin initialization to restore persisted state.
   * Return the previously saved state, or undefined to start fresh.
   */
  loadState?: () => KillSwitchState | Promise<KillSwitchState | undefined> | undefined;
}

export interface KillSwitchState {
  killedAgents: Record<string, string>; // agentId -> reason
  globalKill: boolean;
  globalReason: string;
}

export interface KillSwitchPlugin extends SecurityPlugin {
  /** Disable a specific agent. All its calls will be denied. */
  kill(agentId: string, reason?: string): void;
  /** Re-enable a specific agent. */
  revive(agentId: string): void;
  /** Disable ALL agents globally. */
  killAll(reason?: string): void;
  /** Re-enable all agents. */
  reviveAll(): void;
  /** Check if a specific agent is killed. */
  isKilled(agentId: string): boolean;
  /** Check if the global kill switch is active. */
  isGloballyKilled(): boolean;
  /** Get list of all killed agent IDs. */
  getKilledAgents(): string[];
  /** Get a snapshot of the current state (for persistence). */
  getState(): KillSwitchState;
}

export function killSwitch(config: KillSwitchConfig = {}): KillSwitchPlugin {
  const killedAgents = new Map<string, string>(); // agentId -> reason
  let globalKill = false;
  let globalReason = "";

  function getState(): KillSwitchState {
    const agents: Record<string, string> = {};
    for (const [id, reason] of killedAgents) {
      agents[id] = reason;
    }
    return { killedAgents: agents, globalKill, globalReason };
  }

  function notifyStateChange(): void {
    if (config.onStateChange) {
      try {
        // Fire-and-forget; don't block the caller
        const result = config.onStateChange(getState());
        if (result instanceof Promise) {
          result.catch(() => {}); // swallow async errors in persistence
        }
      } catch {
        // swallow sync errors in persistence
      }
    }
  }

  const plugin: KillSwitchPlugin = {
    name: "kill-switch",
    version: "1.0.0",
    failOpen: false, // Security-critical: fail-closed on error

    async initialize(): Promise<void> {
      if (config.loadState) {
        try {
          const state = await config.loadState();
          if (state) {
            globalKill = state.globalKill ?? false;
            globalReason = state.globalReason ?? "";
            killedAgents.clear();
            if (state.killedAgents) {
              for (const [id, reason] of Object.entries(state.killedAgents)) {
                killedAgents.set(id, reason);
              }
            }
          }
        } catch {
          // If state loading fails, start with clean state (fail-safe)
        }
      }
    },

    async beforeCheck(context: BeforeCheckContext): Promise<PluginResult | void> {
      const agentId = context.request.agent.agent_id;

      // Check global kill switch
      if (globalKill) {
        return {
          decision: denyDecision(
            "GLOBAL_KILL_SWITCH",
            globalReason || "All agents are disabled via global kill switch"
          ),
        };
      }

      // Check agent-specific kill switch
      if (killedAgents.has(agentId)) {
        return {
          decision: denyDecision(
            "AGENT_KILL_SWITCH",
            killedAgents.get(agentId) || `Agent ${agentId} is disabled via kill switch`
          ),
        };
      }
    },

    kill(agentId: string, reason?: string): void {
      killedAgents.set(agentId, reason || `Agent ${agentId} disabled`);
      notifyStateChange();
    },

    revive(agentId: string): void {
      killedAgents.delete(agentId);
      notifyStateChange();
    },

    killAll(reason?: string): void {
      globalKill = true;
      globalReason = reason || "";
      notifyStateChange();
    },

    reviveAll(): void {
      globalKill = false;
      globalReason = "";
      killedAgents.clear();
      notifyStateChange();
    },

    isKilled(agentId: string): boolean {
      return globalKill || killedAgents.has(agentId);
    },

    isGloballyKilled(): boolean {
      return globalKill;
    },

    getKilledAgents(): string[] {
      return Array.from(killedAgents.keys());
    },

    getState,
  };

  return plugin;
}

function denyDecision(code: string, message: string): Decision {
  return {
    outcome: "DENY",
    reasons: [{ code, message }],
  };
}
