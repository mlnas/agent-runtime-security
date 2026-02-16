import { AgentIdentity, ToolIdentity, SecurityPlugin } from "@agent-security/core";

export interface InventoryItem {
  type: "agent" | "tool" | "plugin" | "mcp_server";
  id: string;
  name: string;
  metadata: Record<string, any>;
  registered_at: string;
}

/**
 * Unified inventory — tracks all agents, tools, plugins, and MCP servers
 * in the security posture.
 */
export class PostureInventory {
  private items = new Map<string, InventoryItem>();

  registerAgent(agent: AgentIdentity): void {
    this.items.set(`agent:${agent.agent_id}`, {
      type: "agent",
      id: agent.agent_id,
      name: agent.name,
      metadata: {
        owner: agent.owner,
        environment: agent.environment,
        trust_level: agent.trust_level,
        agent_type: agent.agent_type,
        roles: agent.roles,
        capabilities: agent.capabilities,
      },
      registered_at: new Date().toISOString(),
    });
  }

  registerTool(tool: ToolIdentity): void {
    this.items.set(`tool:${tool.tool_name}`, {
      type: "tool",
      id: tool.tool_name,
      name: tool.tool_name,
      metadata: {
        version: tool.version,
        provider: tool.provider,
        verified: tool.verified,
        permissions_required: tool.permissions_required,
        data_access: tool.data_access,
      },
      registered_at: new Date().toISOString(),
    });
  }

  registerPlugin(plugin: SecurityPlugin): void {
    this.items.set(`plugin:${plugin.name}`, {
      type: "plugin",
      id: plugin.name,
      name: plugin.name,
      metadata: {
        version: plugin.version,
        failOpen: plugin.failOpen,
      },
      registered_at: new Date().toISOString(),
    });
  }

  registerMcpServer(name: string, metadata: Record<string, any>): void {
    this.items.set(`mcp_server:${name}`, {
      type: "mcp_server",
      id: name,
      name,
      metadata,
      registered_at: new Date().toISOString(),
    });
  }

  getAll(): InventoryItem[] {
    return Array.from(this.items.values());
  }

  getByType(type: InventoryItem["type"]): InventoryItem[] {
    return this.getAll().filter((i) => i.type === type);
  }

  get(key: string): InventoryItem | undefined {
    return this.items.get(key);
  }

  remove(key: string): boolean {
    return this.items.delete(key);
  }

  get size(): number {
    return this.items.size;
  }

  getSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const item of this.items.values()) {
      summary[item.type] = (summary[item.type] || 0) + 1;
    }
    return summary;
  }
}
