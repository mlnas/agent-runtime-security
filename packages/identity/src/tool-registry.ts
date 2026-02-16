import * as crypto from "crypto";
import { ToolIdentity } from "@agent-security/core";

/**
 * ToolRegistry — register tools with manifests and verify provenance.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolIdentity>();
  private revokedTools = new Set<string>();

  /**
   * Register a tool identity. If a manifest_hash is provided, the tool
   * is considered verified.
   */
  register(tool: ToolIdentity): void {
    if (this.revokedTools.has(tool.tool_name)) {
      throw new Error(`Tool "${tool.tool_name}" has been revoked`);
    }
    this.tools.set(tool.tool_name, { ...tool });
  }

  /**
   * Look up a tool by name.
   */
  lookup(toolName: string): ToolIdentity | undefined {
    if (this.revokedTools.has(toolName)) return undefined;
    const tool = this.tools.get(toolName);
    return tool ? { ...tool } : undefined;
  }

  /**
   * Revoke a tool, preventing further lookups.
   */
  revoke(toolName: string): boolean {
    const existed = this.tools.has(toolName);
    this.tools.delete(toolName);
    this.revokedTools.add(toolName);
    return existed;
  }

  /**
   * Check if a tool is revoked.
   */
  isRevoked(toolName: string): boolean {
    return this.revokedTools.has(toolName);
  }

  /**
   * Verify a tool's manifest hash against its registered hash.
   * Returns false if the tool is not registered or hashes don't match.
   */
  verifyHash(toolName: string, manifestContent: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool || !tool.manifest_hash) return false;

    const hash = crypto.createHash("sha256").update(manifestContent).digest("hex");
    return hash === tool.manifest_hash;
  }

  /**
   * Compute a SHA-256 hash for tool manifest content.
   */
  static computeHash(manifestContent: string): string {
    return crypto.createHash("sha256").update(manifestContent).digest("hex");
  }

  /**
   * List all registered tools.
   */
  list(): ToolIdentity[] {
    return Array.from(this.tools.values()).map((t) => ({ ...t }));
  }

  /**
   * List tools by provider.
   */
  listByProvider(provider: string): ToolIdentity[] {
    return this.list().filter((t) => t.provider === provider);
  }

  /**
   * List verified-only tools.
   */
  listVerified(): ToolIdentity[] {
    return this.list().filter((t) => t.verified);
  }

  /**
   * Get the count of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools and revocations.
   */
  clear(): void {
    this.tools.clear();
    this.revokedTools.clear();
  }
}
