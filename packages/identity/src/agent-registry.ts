import { AgentIdentity, AgentTrustLevel, AgentType } from "@agent-security/core";

/**
 * AgentRegistry — register, lookup, revoke, and list agents.
 * Provides a centralized store of known agent identities with their
 * trust levels, roles, and attestations.
 */
export class AgentRegistry {
  private agents = new Map<string, AgentIdentity>();
  private revokedAgents = new Set<string>();

  /**
   * Register an agent identity.
   */
  register(identity: AgentIdentity): void {
    if (this.revokedAgents.has(identity.agent_id)) {
      throw new Error(`Agent "${identity.agent_id}" has been revoked and cannot be re-registered`);
    }
    this.agents.set(identity.agent_id, { ...identity });
  }

  /**
   * Look up an agent by ID.
   */
  lookup(agentId: string): AgentIdentity | undefined {
    if (this.revokedAgents.has(agentId)) return undefined;
    const identity = this.agents.get(agentId);
    return identity ? { ...identity } : undefined;
  }

  /**
   * Revoke an agent, preventing further lookups and re-registration.
   */
  revoke(agentId: string): boolean {
    const existed = this.agents.has(agentId);
    this.agents.delete(agentId);
    this.revokedAgents.add(agentId);
    return existed;
  }

  /**
   * Check if an agent is revoked.
   */
  isRevoked(agentId: string): boolean {
    return this.revokedAgents.has(agentId);
  }

  /**
   * List all registered (non-revoked) agents.
   */
  list(): AgentIdentity[] {
    return Array.from(this.agents.values()).map((a) => ({ ...a }));
  }

  /**
   * List agents filtered by type.
   */
  listByType(agentType: AgentType): AgentIdentity[] {
    return this.list().filter((a) => a.agent_type === agentType);
  }

  /**
   * List agents filtered by minimum trust level.
   */
  listByTrustLevel(minLevel: AgentTrustLevel): AgentIdentity[] {
    const minOrder = TRUST_ORDER[minLevel];
    return this.list().filter(
      (a) => a.trust_level && TRUST_ORDER[a.trust_level] >= minOrder
    );
  }

  /**
   * Update an existing agent's identity (partial update).
   */
  update(agentId: string, updates: Partial<Omit<AgentIdentity, "agent_id">>): AgentIdentity {
    const existing = this.agents.get(agentId);
    if (!existing) throw new Error(`Agent "${agentId}" not found`);
    if (this.revokedAgents.has(agentId)) throw new Error(`Agent "${agentId}" is revoked`);

    const updated = { ...existing, ...updates };
    this.agents.set(agentId, updated);
    return { ...updated };
  }

  /**
   * Get the count of registered agents.
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Clear all agents and revocations.
   */
  clear(): void {
    this.agents.clear();
    this.revokedAgents.clear();
  }
}

const TRUST_ORDER: Record<AgentTrustLevel, number> = {
  untrusted: 0,
  basic: 1,
  verified: 2,
  privileged: 3,
  system: 4,
};
