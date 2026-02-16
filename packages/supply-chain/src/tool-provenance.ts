import * as crypto from "crypto";

export interface ProvenanceRecord {
  tool_name: string;
  manifest_hash: string;
  registered_at: string;
  source?: string;
  publisher?: string;
}

export interface ProvenanceCheckResult {
  valid: boolean;
  tool_name: string;
  reason: string;
  expected_hash?: string;
  actual_hash?: string;
}

/**
 * ToolProvenance — verify tool manifest integrity against known-good hashes.
 */
export class ToolProvenance {
  private records = new Map<string, ProvenanceRecord>();

  /**
   * Register a known-good tool manifest hash.
   */
  register(toolName: string, manifestContent: string, metadata?: { source?: string; publisher?: string }): ProvenanceRecord {
    const hash = crypto.createHash("sha256").update(manifestContent).digest("hex");
    const record: ProvenanceRecord = {
      tool_name: toolName,
      manifest_hash: hash,
      registered_at: new Date().toISOString(),
      source: metadata?.source,
      publisher: metadata?.publisher,
    };
    this.records.set(toolName, record);
    return record;
  }

  /**
   * Verify a tool manifest against its registered hash.
   */
  verify(toolName: string, manifestContent: string): ProvenanceCheckResult {
    const record = this.records.get(toolName);
    if (!record) {
      return { valid: false, tool_name: toolName, reason: `Tool "${toolName}" has no provenance record` };
    }

    const actualHash = crypto.createHash("sha256").update(manifestContent).digest("hex");
    if (actualHash !== record.manifest_hash) {
      return {
        valid: false,
        tool_name: toolName,
        reason: `Manifest hash mismatch — possible tampering detected`,
        expected_hash: record.manifest_hash,
        actual_hash: actualHash,
      };
    }

    return { valid: true, tool_name: toolName, reason: "Hash verified" };
  }

  /**
   * Get the provenance record for a tool.
   */
  getRecord(toolName: string): ProvenanceRecord | undefined {
    return this.records.get(toolName);
  }

  /**
   * List all provenance records.
   */
  list(): ProvenanceRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Remove a provenance record.
   */
  remove(toolName: string): boolean {
    return this.records.delete(toolName);
  }
}
