import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { DecisionOutcome, PolicyBundle } from "./schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_OUTCOMES: ReadonlySet<string> = new Set<DecisionOutcome>([
  "ALLOW",
  "DENY",
  "REQUIRE_APPROVAL",
]);

/**
 * PolicyBundleLoader - loads and validates policy bundles from multiple sources.
 *
 * Supports:
 *   - File path (sync, with path sanitization)
 *   - JSON string (sync)
 *   - PolicyBundle object (sync)
 *   - Custom async loader function
 *   - HMAC signature verification
 */
export class PolicyBundleLoader {
  /**
   * Load a policy bundle from a file path (synchronous).
   * Resolves to an absolute path and validates it stays within the allowed base directory.
   *
   * @param filePath Path to the policy JSON file
   * @param options.allowedBasePath Restrict file loading to this directory (default: cwd)
   * @param options.signatureSecret HMAC secret for integrity verification
   */
  static loadFromFile(
    filePath: string,
    options?: { allowedBasePath?: string; signatureSecret?: string }
  ): PolicyBundle {
    const sanitized = this.sanitizePath(filePath, options?.allowedBasePath);
    const content = fs.readFileSync(sanitized, "utf-8");
    const bundle = this.parseAndValidate(content, options?.signatureSecret);
    return bundle;
  }

  /**
   * Load a policy bundle from a JSON string (synchronous).
   */
  static loadFromString(json: string, signatureSecret?: string): PolicyBundle {
    const bundle = this.parseAndValidate(json, signatureSecret);
    return bundle;
  }

  /**
   * Load a policy bundle from a plain object (synchronous).
   * Useful when constructing bundles programmatically.
   */
  static loadFromObject(obj: unknown, signatureSecret?: string): PolicyBundle {
    const bundle = this.validateShape(obj);
    this.validateSemantics(bundle);
    if (signatureSecret) {
      this.verifySignature(bundle, signatureSecret);
    }
    return bundle;
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
  static async loadAsync(
    loader: () => Promise<PolicyBundle | string>,
    signatureSecret?: string
  ): Promise<PolicyBundle> {
    const result = await loader();
    if (typeof result === "string") {
      return this.parseAndValidate(result, signatureSecret);
    }
    const bundle = this.validateShape(result);
    this.validateSemantics(bundle);
    if (signatureSecret) {
      this.verifySignature(bundle, signatureSecret);
    }
    return bundle;
  }

  // -----------------------------------------------------------------------
  // Signature utilities
  // -----------------------------------------------------------------------

  /**
   * Compute an HMAC-SHA256 signature for a policy bundle.
   * Use this to sign policies before distribution.
   *
   * @param bundle The policy bundle to sign (signature field is excluded from hash)
   * @param secret The HMAC secret key
   * @returns hex-encoded HMAC signature
   */
  static computeSignature(bundle: PolicyBundle, secret: string): string {
    const { signature: _, ...bundleWithoutSig } = bundle;
    const payload = JSON.stringify(bundleWithoutSig, Object.keys(bundleWithoutSig).sort());
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  /**
   * Sign a policy bundle in place. Sets the `signature` field.
   */
  static signBundle(bundle: PolicyBundle, secret: string): PolicyBundle {
    bundle.signature = this.computeSignature(bundle, secret);
    return bundle;
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  /**
   * Full validation: parse JSON string, validate shape and semantics.
   */
  private static parseAndValidate(json: string, signatureSecret?: string): PolicyBundle {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (err) {
      throw new Error(`PolicyBundle JSON parse error: ${(err as Error).message}`);
    }
    const bundle = this.validateShape(raw);
    this.validateSemantics(bundle);
    if (signatureSecret) {
      this.verifySignature(bundle, signatureSecret);
    }
    return bundle;
  }

  /**
   * Validate that the raw parsed object has the expected shape.
   * Performs runtime type checks instead of bare `as` casts.
   */
  private static validateShape(raw: unknown): PolicyBundle {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("PolicyBundle must be a non-null object");
    }

    const obj = raw as Record<string, unknown>;

    // Top-level required fields
    if (typeof obj.version !== "string" || !obj.version) {
      throw new Error("PolicyBundle missing or invalid 'version' (expected non-empty string)");
    }
    if (typeof obj.generated_at !== "string" || !obj.generated_at) {
      throw new Error("PolicyBundle missing or invalid 'generated_at' (expected ISO-8601 string)");
    }
    if (typeof obj.expires_at !== "string" || !obj.expires_at) {
      throw new Error("PolicyBundle missing or invalid 'expires_at' (expected ISO-8601 string)");
    }
    if (!Array.isArray(obj.rules)) {
      throw new Error("PolicyBundle 'rules' must be an array");
    }

    // Defaults
    if (obj.defaults === null || typeof obj.defaults !== "object" || Array.isArray(obj.defaults)) {
      throw new Error("PolicyBundle missing 'defaults' object");
    }
    const defaults = obj.defaults as Record<string, unknown>;
    if (typeof defaults.outcome !== "string" || !VALID_OUTCOMES.has(defaults.outcome)) {
      throw new Error(
        `PolicyBundle defaults.outcome must be one of: ${[...VALID_OUTCOMES].join(", ")}. Got: "${defaults.outcome}"`
      );
    }

    // Validate each rule shape
    const rules = obj.rules as unknown[];
    rules.forEach((rule, index) => {
      if (rule === null || typeof rule !== "object" || Array.isArray(rule)) {
        throw new Error(`Rule at index ${index} must be a non-null object`);
      }
      const r = rule as Record<string, unknown>;

      if (typeof r.id !== "string" || !r.id) {
        throw new Error(`Rule at index ${index} missing or invalid 'id'`);
      }
      if (typeof r.description !== "string") {
        throw new Error(`Rule "${r.id}" missing or invalid 'description'`);
      }

      // match
      if (r.match === null || typeof r.match !== "object" || Array.isArray(r.match)) {
        throw new Error(`Rule "${r.id}" missing or invalid 'match' object`);
      }
      const match = r.match as Record<string, unknown>;
      if (typeof match.tool_name !== "string" && !Array.isArray(match.tool_name)) {
        throw new Error(`Rule "${r.id}" match.tool_name must be a string or string[]`);
      }
      if (Array.isArray(match.tool_name)) {
        for (const tn of match.tool_name) {
          if (typeof tn !== "string") {
            throw new Error(`Rule "${r.id}" match.tool_name array must contain only strings`);
          }
        }
      }
      if (typeof match.environment !== "string") {
        throw new Error(`Rule "${r.id}" match.environment must be a string`);
      }

      // outcome
      if (typeof r.outcome !== "string" || !VALID_OUTCOMES.has(r.outcome)) {
        throw new Error(
          `Rule "${r.id}" outcome must be one of: ${[...VALID_OUTCOMES].join(", ")}. Got: "${r.outcome}"`
        );
      }

      // when (optional)
      if (r.when !== undefined) {
        if (r.when === null || typeof r.when !== "object" || Array.isArray(r.when)) {
          throw new Error(`Rule "${r.id}" 'when' must be an object`);
        }
        const when = r.when as Record<string, unknown>;

        if (when.contains_any !== undefined && !Array.isArray(when.contains_any)) {
          throw new Error(`Rule "${r.id}" when.contains_any must be a string[]`);
        }
        if (when.not_contains !== undefined && !Array.isArray(when.not_contains)) {
          throw new Error(`Rule "${r.id}" when.not_contains must be a string[]`);
        }
        if (when.matches_regex !== undefined && typeof when.matches_regex !== "string") {
          throw new Error(`Rule "${r.id}" when.matches_regex must be a string`);
        }
        if (when.data_labels_any !== undefined && !Array.isArray(when.data_labels_any)) {
          throw new Error(`Rule "${r.id}" when.data_labels_any must be a string[]`);
        }
      }
    });

    return raw as PolicyBundle;
  }

  /**
   * Semantic validation: expiration, date formats, etc.
   */
  private static validateSemantics(bundle: PolicyBundle): void {
    // Validate date formats
    const generatedAt = new Date(bundle.generated_at);
    if (isNaN(generatedAt.getTime())) {
      throw new Error(`PolicyBundle generated_at is not a valid date: "${bundle.generated_at}"`);
    }

    const expiresAt = new Date(bundle.expires_at);
    if (isNaN(expiresAt.getTime())) {
      throw new Error(`PolicyBundle expires_at is not a valid date: "${bundle.expires_at}"`);
    }

    // Check expiration
    if (expiresAt < new Date()) {
      throw new Error(`PolicyBundle expired at ${bundle.expires_at}`);
    }

    // generated_at should be before expires_at
    if (generatedAt >= expiresAt) {
      throw new Error("PolicyBundle generated_at must be before expires_at");
    }
  }

  /**
   * Verify the HMAC-SHA256 signature of a policy bundle.
   * Throws if signature is missing or invalid.
   */
  private static verifySignature(bundle: PolicyBundle, secret: string): void {
    if (!bundle.signature) {
      throw new Error("PolicyBundle signature is required but missing");
    }

    const expected = this.computeSignature(bundle, secret);

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(bundle.signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new Error("PolicyBundle signature verification failed — policy may have been tampered with");
    }
  }

  // -----------------------------------------------------------------------
  // Path sanitization
  // -----------------------------------------------------------------------

  /**
   * Sanitize a file path to prevent path traversal attacks.
   * Resolves to absolute path and verifies it's within the allowed base directory.
   */
  private static sanitizePath(filePath: string, allowedBasePath?: string): string {
    const resolved = path.resolve(filePath);
    const base = allowedBasePath ? path.resolve(allowedBasePath) : path.resolve(".");

    // Ensure the resolved path is within the allowed base directory
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new Error(
        `Policy file path "${filePath}" resolves outside the allowed directory "${base}"`
      );
    }

    // Ensure the file exists and is a regular file
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        throw new Error(`Policy path "${resolved}" is not a regular file`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Policy file not found: "${resolved}"`);
      }
      throw err;
    }

    return resolved;
  }

  // -----------------------------------------------------------------------
  // Public convenience: legacy validate() for backward compat
  // -----------------------------------------------------------------------

  /**
   * Validate a policy bundle structure and semantics.
   * @deprecated Use loadFromObject() which includes full validation.
   */
  static validate(bundle: PolicyBundle): void {
    this.validateShape(bundle);
    this.validateSemantics(bundle);
  }
}
