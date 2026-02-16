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
  "STEP_UP",
  "REQUIRE_TICKET",
  "REQUIRE_HUMAN",
]);

const DEFAULT_MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_JSON_SIZE_BYTES = 1 * 1024 * 1024;         // 1 MB
const MAX_OBJECT_DEPTH = 20;
const MAX_RULES = 1000;
const HMAC_HEX_LENGTH = 64; // SHA-256 produces 32 bytes = 64 hex chars
const VALID_HEX_RE = /^[0-9a-f]+$/;

/**
 * PolicyBundleLoader - loads and validates policy bundles from multiple sources.
 *
 * Supports:
 *   - File path (sync, with path sanitization and size limits)
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
   * @param options.maxSizeBytes Maximum allowed file size in bytes (default: 1 MB)
   */
  static loadFromFile(
    filePath: string,
    options?: { allowedBasePath?: string; signatureSecret?: string; maxSizeBytes?: number }
  ): PolicyBundle {
    const maxSizeBytes = options?.maxSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
    const sanitized = this.sanitizePath(filePath, options?.allowedBasePath, maxSizeBytes);
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
   * @returns hex-encoded HMAC signature (64 characters)
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
    // Enforce JSON string size limit to prevent JSON bombs
    if (Buffer.byteLength(json, "utf-8") > MAX_JSON_SIZE_BYTES) {
      throw new Error(
        `PolicyBundle JSON exceeds maximum allowed size of ${MAX_JSON_SIZE_BYTES} bytes`
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (err) {
      throw new Error(`PolicyBundle JSON parse error: ${(err as Error).message}`);
    }

    // Enforce object depth limit to prevent deeply-nested JSON bombs
    const depth = this.getObjectDepth(raw);
    if (depth > MAX_OBJECT_DEPTH) {
      throw new Error(
        `PolicyBundle JSON exceeds maximum object depth of ${MAX_OBJECT_DEPTH} (actual depth: ${depth})`
      );
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

    // Enforce max rules limit
    if (obj.rules.length > MAX_RULES) {
      throw new Error(
        `PolicyBundle exceeds maximum rule count of ${MAX_RULES} (actual: ${obj.rules.length})`
      );
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
   * Throws if signature is missing, malformed, or invalid.
   * Error messages are kept generic to avoid leaking information.
   */
  private static verifySignature(bundle: PolicyBundle, secret: string): void {
    if (!bundle.signature) {
      throw new Error("PolicyBundle signature is required but missing");
    }

    // Validate hex format and length before parsing
    if (bundle.signature.length !== HMAC_HEX_LENGTH) {
      throw new Error("PolicyBundle signature verification failed — policy may have been tampered with");
    }
    if (!VALID_HEX_RE.test(bundle.signature)) {
      throw new Error("PolicyBundle signature verification failed — policy may have been tampered with");
    }

    const expected = this.computeSignature(bundle, secret);

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(bundle.signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new Error("PolicyBundle signature verification failed — policy may have been tampered with");
    }
  }

  // -----------------------------------------------------------------------
  // Path sanitization
  // -----------------------------------------------------------------------

  /**
   * Sanitize a file path to prevent path traversal and symlink attacks.
   * Resolves to absolute path, verifies it's within the allowed base directory,
   * uses lstat() to detect symlinks, and checks file size before reading.
   */
  private static sanitizePath(
    filePath: string,
    allowedBasePath?: string,
    maxSizeBytes: number = DEFAULT_MAX_FILE_SIZE_BYTES
  ): string {
    const resolved = path.resolve(filePath);
    const base = allowedBasePath ? path.resolve(allowedBasePath) : path.resolve(".");

    // Ensure the resolved path is within the allowed base directory
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new Error(
        `Policy file path "${filePath}" resolves outside the allowed directory "${base}"`
      );
    }

    // Use lstat() instead of stat() to detect and reject symlinks
    let lstat: fs.Stats;
    try {
      lstat = fs.lstatSync(resolved);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Policy file not found: "${resolved}"`);
      }
      throw err;
    }

    if (lstat.isSymbolicLink()) {
      throw new Error(
        `Policy file "${resolved}" is a symbolic link — symlinks are not allowed to prevent TOCTOU attacks`
      );
    }

    if (!lstat.isFile()) {
      throw new Error(`Policy path "${resolved}" is not a regular file`);
    }

    // Validate file size before reading to prevent resource exhaustion
    if (lstat.size > maxSizeBytes) {
      throw new Error(
        `Policy file "${resolved}" exceeds maximum allowed size of ${maxSizeBytes} bytes (actual: ${lstat.size} bytes)`
      );
    }

    return resolved;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Compute the maximum nesting depth of a JSON value.
   * Used to detect deeply-nested JSON bombs before full traversal.
   */
  private static getObjectDepth(value: unknown, currentDepth = 0): number {
    if (currentDepth > MAX_OBJECT_DEPTH) {
      // Short-circuit: already over the limit, no need to go deeper
      return currentDepth;
    }

    if (value === null || typeof value !== "object") {
      return currentDepth;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return currentDepth + 1;
      return Math.max(...value.map((item) => this.getObjectDepth(item, currentDepth + 1)));
    }

    const keys = Object.keys(value as object);
    if (keys.length === 0) return currentDepth + 1;
    return Math.max(
      ...keys.map((key) =>
        this.getObjectDepth((value as Record<string, unknown>)[key], currentDepth + 1)
      )
    );
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
