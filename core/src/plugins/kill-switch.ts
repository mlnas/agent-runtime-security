import { SecurityPlugin, BeforeCheckContext, PluginResult, Decision } from "../schemas";

/**
 * Kill Switch Plugin
 *
 * Provides an emergency stop mechanism for individual agents or globally.
 * When an agent is killed, all its tool calls are immediately denied
 * without reaching the policy engine.
 *
 * @example
 * ```typescript
 * const ks = killSwitch();
 * const security = new AgentSecurity({
 *   policyPath: './policy.json',
 *   plugins: [ks]
 * });
 *
 * // Emergency: disable a rogue agent
 * ks.kill('rogue-agent-001');
 *
 * // Re-enable after investigation
 * ks.revive('rogue-agent-001');
 *
 * // Nuclear option: disable ALL agents
 * ks.killAll();
 * ```
 */
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
}

export function killSwitch(): KillSwitchPlugin {
  const killedAgents = new Map<string, string>(); // agentId -> reason
  let globalKill = false;
  let globalReason = "";

  const plugin: KillSwitchPlugin = {
    name: "kill-switch",
    version: "1.0.0",

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
    },

    revive(agentId: string): void {
      killedAgents.delete(agentId);
    },

    killAll(reason?: string): void {
      globalKill = true;
      globalReason = reason || "";
    },

    reviveAll(): void {
      globalKill = false;
      globalReason = "";
      killedAgents.clear();
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
  };

  return plugin;
}

function denyDecision(code: string, message: string): Decision {
  return {
    outcome: "DENY",
    reasons: [{ code, message }],
  };
}
