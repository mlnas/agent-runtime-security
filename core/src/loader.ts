import * as fs from "fs";
import { PolicyBundle } from "./schemas";

/**
 * PolicyBundleLoader - loads and validates policy bundles from multiple sources.
 *
 * Supports:
 *   - File path (sync)
 *   - JSON string (sync)
 *   - PolicyBundle object (sync)
 *   - Custom async loader function
 */
export class PolicyBundleLoader {
  /**
   * Load a policy bundle from a file path (synchronous).
   */
  static loadFromFile(filePath: string): PolicyBundle {
    const content = fs.readFileSync(filePath, "utf-8");
    const bundle = JSON.parse(content) as PolicyBundle;
    this.validate(bundle);
    return bundle;
  }

  /**
   * Load a policy bundle from a JSON string (synchronous).
   */
  static loadFromString(json: string): PolicyBundle {
    const bundle = JSON.parse(json) as PolicyBundle;
    this.validate(bundle);
    return bundle;
  }

  /**
   * Load a policy bundle from a plain object (synchronous).
   * Useful when constructing bundles programmatically.
   */
  static loadFromObject(obj: PolicyBundle): PolicyBundle {
    this.validate(obj);
    return obj;
  }

  /**
   * Load a policy bundle using a custom async loader function.
   * The loader must return a PolicyBundle (or a JSON string).
   *
   * @example
   * ```typescript
   * const bundle = await PolicyBundleLoader.loadAsync(async () => {
   *   const res = await fetch('https://policies.company.com/v1/bundle');
   *   return res.json();
   * });
   * ```
   */
  static async loadAsync(loader: () => Promise<PolicyBundle | string>): Promise<PolicyBundle> {
    const result = await loader();
    const bundle = typeof result === "string" ? JSON.parse(result) as PolicyBundle : result;
    this.validate(bundle);
    return bundle;
  }

  /**
   * Validate a policy bundle structure.
   * Throws descriptive errors for invalid bundles.
   */
  static validate(bundle: PolicyBundle): void {
    if (!bundle.version) {
      throw new Error("PolicyBundle missing version");
    }
    if (!bundle.generated_at) {
      throw new Error("PolicyBundle missing generated_at");
    }
    if (!bundle.expires_at) {
      throw new Error("PolicyBundle missing expires_at");
    }
    if (!Array.isArray(bundle.rules)) {
      throw new Error("PolicyBundle rules must be an array");
    }
    if (!bundle.defaults || !bundle.defaults.outcome) {
      throw new Error("PolicyBundle missing defaults.outcome");
    }

    // Check if bundle is expired
    const expiresAt = new Date(bundle.expires_at);
    if (expiresAt < new Date()) {
      throw new Error(`PolicyBundle expired at ${bundle.expires_at}`);
    }

    // Validate each rule
    bundle.rules.forEach((rule, index) => {
      if (!rule.id) {
        throw new Error(`Rule at index ${index} missing id`);
      }
      if (!rule.match) {
        throw new Error(`Rule ${rule.id} missing match`);
      }
      if (!rule.outcome) {
        throw new Error(`Rule ${rule.id} missing outcome`);
      }
    });
  }
}
