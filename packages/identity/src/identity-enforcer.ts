import {
  SecurityPlugin,
  BeforeCheckContext,
  PluginResult,
  AgentTrustLevel,
} from "@agent-security/core";
import { AgentRegistry } from "./agent-registry";
import { ToolRegistry } from "./tool-registry";
import { TrustEvaluator, TrustContext } from "./trust-evaluator";

export interface IdentityEnforcerConfig {
  /** AgentRegistry to validate agent registration */
  agentRegistry: AgentRegistry;
  /** ToolRegistry to validate tool registration */
  toolRegistry?: ToolRegistry;
  /** TrustEvaluator for contextual trust evaluation */
  trustEvaluator?: TrustEvaluator;
  /** Require agents to be registered. Default: true */
  requireRegistration?: boolean;
  /** Require tools to be registered. Default: false */
  requireToolRegistration?: boolean;
  /** Minimum trust level to allow any action. Default: undefined (no minimum) */
  minimumTrustLevel?: AgentTrustLevel;
  /** Maximum delegation depth. Default: undefined (no limit) */
  maxDelegationDepth?: number;
}

/**
 * Identity enforcer plugin — validates agent registration, trust level,
 * delegation depth, and tool provenance before allowing tool calls.
 */
export function identityEnforcer(config: IdentityEnforcerConfig): SecurityPlugin {
  const {
    agentRegistry,
    toolRegistry,
    trustEvaluator,
    requireRegistration = true,
    requireToolRegistration = false,
    minimumTrustLevel,
    maxDelegationDepth,
  } = config;

  return {
    name: "identity-enforcer",
    version: "0.1.0",
    failOpen: false,

    async beforeCheck(context: BeforeCheckContext): Promise<PluginResult | void> {
      const { request } = context;
      const agentId = request.agent.agent_id;

      // Check if agent is registered
      if (requireRegistration) {
        if (agentRegistry.isRevoked(agentId)) {
          return {
            decision: {
              outcome: "DENY",
              reasons: [{ code: "AGENT_REVOKED", message: `Agent "${agentId}" has been revoked` }],
            },
          };
        }

        const identity = agentRegistry.lookup(agentId);
        if (!identity) {
          return {
            decision: {
              outcome: "DENY",
              reasons: [{ code: "AGENT_UNREGISTERED", message: `Agent "${agentId}" is not registered` }],
            },
          };
        }

        // Enrich the request with registered identity data
        const enrichedRequest = {
          ...request,
          agent: {
            ...request.agent,
            agent_type: request.agent.agent_type || identity.agent_type,
            trust_level: request.agent.trust_level || identity.trust_level,
            roles: request.agent.roles || identity.roles,
            capabilities: request.agent.capabilities || identity.capabilities,
            max_delegation_depth: request.agent.max_delegation_depth ?? identity.max_delegation_depth,
            attestation: request.agent.attestation || identity.attestation,
          },
        };

        // Check minimum trust level
        if (minimumTrustLevel) {
          if (trustEvaluator) {
            const trustContext: TrustContext = {
              environment: request.agent.environment,
              delegation_depth: request.context.delegation_chain?.length,
            };
            if (!trustEvaluator.meetsMinimumTrust(identity, minimumTrustLevel, trustContext)) {
              return {
                decision: {
                  outcome: "DENY",
                  reasons: [{
                    code: "INSUFFICIENT_TRUST",
                    message: `Agent "${agentId}" does not meet minimum trust level "${minimumTrustLevel}"`,
                  }],
                },
              };
            }
          } else {
            const agentLevel = identity.trust_level || "basic";
            const TRUST_ORDER: Record<AgentTrustLevel, number> = {
              untrusted: 0, basic: 1, verified: 2, privileged: 3, system: 4,
            };
            if (TRUST_ORDER[agentLevel] < TRUST_ORDER[minimumTrustLevel]) {
              return {
                decision: {
                  outcome: "DENY",
                  reasons: [{
                    code: "INSUFFICIENT_TRUST",
                    message: `Agent "${agentId}" trust level "${agentLevel}" is below minimum "${minimumTrustLevel}"`,
                  }],
                },
              };
            }
          }
        }

        // Check delegation depth
        if (maxDelegationDepth !== undefined) {
          const delegationChain = request.context.delegation_chain || [];
          if (delegationChain.length > maxDelegationDepth) {
            return {
              decision: {
                outcome: "DENY",
                reasons: [{
                  code: "DELEGATION_DEPTH_EXCEEDED",
                  message: `Delegation depth ${delegationChain.length} exceeds maximum ${maxDelegationDepth}`,
                }],
              },
            };
          }
        }

        // Return enriched request
        return { modifiedRequest: enrichedRequest };
      }

      // Check tool registration
      if (requireToolRegistration && toolRegistry) {
        const toolName = request.action.tool_name;
        if (toolRegistry.isRevoked(toolName)) {
          return {
            decision: {
              outcome: "DENY",
              reasons: [{ code: "TOOL_REVOKED", message: `Tool "${toolName}" has been revoked` }],
            },
          };
        }

        const toolIdentity = toolRegistry.lookup(toolName);
        if (!toolIdentity) {
          return {
            decision: {
              outcome: "DENY",
              reasons: [{ code: "TOOL_UNREGISTERED", message: `Tool "${toolName}" is not registered` }],
            },
          };
        }

        // Enrich the request with tool identity
        return {
          modifiedRequest: {
            ...request,
            action: {
              ...request.action,
              tool_identity: request.action.tool_identity || toolIdentity,
            },
          },
        };
      }
    },
  };
}
