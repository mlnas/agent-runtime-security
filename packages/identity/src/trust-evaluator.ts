import { AgentIdentity, AgentTrustLevel } from "@agent-security/core";

export interface TrustContext {
  environment?: string;
  delegation_depth?: number;
  time_of_day?: number; // 0-23
  ip_address?: string;
  consecutive_denials?: number;
}

export interface TrustResult {
  effective_trust: AgentTrustLevel;
  base_trust: AgentTrustLevel;
  adjustments: Array<{ reason: string; delta: number }>;
  score: number; // 0-100
}

const TRUST_ORDER: Record<AgentTrustLevel, number> = {
  untrusted: 0,
  basic: 1,
  verified: 2,
  privileged: 3,
  system: 4,
};

const TRUST_FROM_ORDER: AgentTrustLevel[] = [
  "untrusted",
  "basic",
  "verified",
  "privileged",
  "system",
];

/**
 * TrustEvaluator — compute effective trust level from identity + context.
 * Combines the agent's base trust level with contextual signals
 * (environment, delegation depth, time) to produce an effective trust level.
 */
export class TrustEvaluator {
  /**
   * Compute the effective trust level for an agent in a given context.
   */
  evaluate(identity: AgentIdentity, context?: TrustContext): TrustResult {
    const baseTrust = identity.trust_level || "basic";
    let score = TRUST_ORDER[baseTrust] * 25; // 0, 25, 50, 75, 100
    const adjustments: Array<{ reason: string; delta: number }> = [];

    if (context) {
      // Downgrade trust in production if agent has no attestation
      if (context.environment === "prod" && !identity.attestation) {
        const delta = -10;
        adjustments.push({ reason: "No attestation in production", delta });
        score += delta;
      }

      // Downgrade trust based on delegation depth
      if (
        context.delegation_depth !== undefined &&
        identity.max_delegation_depth !== undefined &&
        context.delegation_depth > identity.max_delegation_depth
      ) {
        const delta = -25;
        adjustments.push({ reason: "Delegation depth exceeded", delta });
        score += delta;
      }

      // Downgrade trust for operations outside business hours (configurable)
      if (context.time_of_day !== undefined && (context.time_of_day < 6 || context.time_of_day > 22)) {
        const delta = -5;
        adjustments.push({ reason: "Outside business hours", delta });
        score += delta;
      }

      // Downgrade for consecutive denials
      if (context.consecutive_denials !== undefined && context.consecutive_denials > 3) {
        const delta = -15;
        adjustments.push({ reason: `${context.consecutive_denials} consecutive denials`, delta });
        score += delta;
      }

      // Expired attestation check
      if (identity.attestation?.expires_at) {
        const expiresAt = new Date(identity.attestation.expires_at);
        if (expiresAt < new Date()) {
          const delta = -20;
          adjustments.push({ reason: "Attestation expired", delta });
          score += delta;
        }
      }
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // Map score back to trust level
    const effectiveOrder = Math.min(4, Math.max(0, Math.floor(score / 25)));
    const effectiveTrust = TRUST_FROM_ORDER[effectiveOrder];

    return {
      effective_trust: effectiveTrust,
      base_trust: baseTrust,
      adjustments,
      score,
    };
  }

  /**
   * Check if an agent meets a minimum trust level in a given context.
   */
  meetsMinimumTrust(
    identity: AgentIdentity,
    minLevel: AgentTrustLevel,
    context?: TrustContext
  ): boolean {
    const result = this.evaluate(identity, context);
    return TRUST_ORDER[result.effective_trust] >= TRUST_ORDER[minLevel];
  }
}
