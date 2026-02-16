import { ClassificationResult, DataClassification } from "./classifiers";
import { DestinationRule, EgressChannel, EgressPolicy } from "./egress-types";

export interface DestinationCheckResult {
  allowed: boolean;
  matched_rule?: DestinationRule;
  reason: string;
}

/**
 * DestinationPolicyEngine — enforces egress destination policies
 * based on data classifications, channels, and destination patterns.
 */
export class DestinationPolicyEngine {
  private policy: EgressPolicy;

  constructor(policy: EgressPolicy) {
    this.policy = policy;
  }

  /**
   * Check if classified data can egress to a destination via a channel.
   */
  check(
    classifications: ClassificationResult[],
    channel: EgressChannel,
    destination?: string
  ): DestinationCheckResult {
    if (classifications.length === 0) {
      return { allowed: true, reason: "No classified data detected" };
    }

    const classificationTypes = new Set(classifications.map((c) => c.classification));

    for (const rule of this.policy.rules) {
      // Check if rule applies to any of the detected classifications
      const classMatch = rule.classifications.some((c) => classificationTypes.has(c));
      if (!classMatch) continue;

      // Check if rule applies to this channel
      if (rule.channels && rule.channels.length > 0 && !rule.channels.includes(channel)) {
        continue;
      }

      // Check blocked destinations first (takes precedence)
      if (destination && rule.blocked_destinations) {
        const isBlocked = rule.blocked_destinations.some((pat) =>
          matchGlob(pat, destination)
        );
        if (isBlocked) {
          return {
            allowed: false,
            matched_rule: rule,
            reason: `Destination "${destination}" blocked by rule "${rule.id}": ${rule.description}`,
          };
        }
      }

      // Check allowed destinations
      if (rule.action === "block") {
        if (!rule.allowed_destinations || rule.allowed_destinations.length === 0) {
          // No allowed destinations = block all
          return {
            allowed: false,
            matched_rule: rule,
            reason: `Data classified as [${Array.from(classificationTypes).join(", ")}] blocked by rule "${rule.id}": ${rule.description}`,
          };
        }

        if (destination) {
          const isAllowed = rule.allowed_destinations.some((pat) =>
            matchGlob(pat, destination)
          );
          if (!isAllowed) {
            return {
              allowed: false,
              matched_rule: rule,
              reason: `Destination "${destination}" not in allowed list for rule "${rule.id}"`,
            };
          }
        }
      }
    }

    // Default action
    const defaultAction = this.policy.default_action || "block";
    if (defaultAction === "block" && classifications.length > 0) {
      return {
        allowed: false,
        reason: `Default policy blocks egress of classified data [${Array.from(classificationTypes).join(", ")}]`,
      };
    }

    return { allowed: true, reason: "No blocking rules matched" };
  }

  /**
   * Update the egress policy.
   */
  updatePolicy(policy: EgressPolicy): void {
    this.policy = policy;
  }
}

/**
 * Simple glob matching — supports * and ** patterns.
 */
function matchGlob(pattern: string, value: string): boolean {
  if (pattern === "*") return true;

  // Convert glob to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___DOUBLESTAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DOUBLESTAR___/g, ".*");

  const regex = new RegExp(`^${regexStr}$`, "i");
  return regex.test(value);
}
