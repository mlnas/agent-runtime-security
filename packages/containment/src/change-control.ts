/**
 * ChangeControl — ticket validation for change management integration.
 */

export interface TicketInfo {
  ticket_id: string;
  status: "open" | "approved" | "in_progress" | "closed" | "rejected";
  title?: string;
  assignee?: string;
  approved_by?: string;
  approved_at?: string;
}

export type TicketProvider = "jira" | "linear" | "github" | "custom";

export interface ChangeControlConfig {
  /** Ticket provider type */
  provider: TicketProvider;
  /** Custom ticket validator function */
  validateTicket?: (ticketId: string) => Promise<TicketInfo | null>;
  /** Required ticket statuses for approval. Default: ["approved", "in_progress"] */
  required_statuses?: string[];
  /** Ticket ID pattern (regex) for validation */
  ticket_pattern?: string;
}

/**
 * ChangeControl — validates tickets before allowing high-risk operations.
 */
export class ChangeControl {
  private config: ChangeControlConfig;
  private ticketCache = new Map<string, { info: TicketInfo; cachedAt: number }>();
  private cacheTtlMs = 60000; // 1 minute cache

  constructor(config: ChangeControlConfig) {
    this.config = config;
  }

  /**
   * Validate a ticket ID. Returns the ticket info if valid, null if invalid.
   */
  async validate(ticketId: string): Promise<TicketInfo | null> {
    // Check pattern
    if (this.config.ticket_pattern) {
      const pattern = new RegExp(this.config.ticket_pattern);
      if (!pattern.test(ticketId)) {
        return null;
      }
    }

    // Check cache
    const cached = this.ticketCache.get(ticketId);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs) {
      return this.isApproved(cached.info) ? cached.info : null;
    }

    // Validate via provider
    if (this.config.validateTicket) {
      const info = await this.config.validateTicket(ticketId);
      if (info) {
        this.ticketCache.set(ticketId, { info, cachedAt: Date.now() });
        return this.isApproved(info) ? info : null;
      }
      return null;
    }

    // Default: accept any well-formatted ticket ID
    const info: TicketInfo = {
      ticket_id: ticketId,
      status: "approved",
    };
    this.ticketCache.set(ticketId, { info, cachedAt: Date.now() });
    return info;
  }

  private isApproved(info: TicketInfo): boolean {
    const requiredStatuses = this.config.required_statuses || ["approved", "in_progress"];
    return requiredStatuses.includes(info.status);
  }

  /**
   * Clear the ticket cache.
   */
  clearCache(): void {
    this.ticketCache.clear();
  }
}
