import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PolicyBundleLoader } from "../loader";
import { PolicyBundle } from "../schemas";

const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

const VALID_BUNDLE: PolicyBundle = {
  version: "0.1.0",
  generated_at: "2026-01-01T00:00:00.000Z",
  expires_at: FUTURE,
  rules: [
    {
      id: "DENY_TOOL",
      description: "Block bad tool",
      match: { tool_name: "bad_tool", environment: "*" },
      outcome: "DENY",
    },
  ],
  defaults: { outcome: "ALLOW" },
};

function writeTempBundle(content: string): string {
  const file = path.join(os.tmpdir(), `policy-test-${Date.now()}.json`);
  fs.writeFileSync(file, content, "utf-8");
  return file;
}

describe("PolicyBundleLoader", () => {
  test("1. loadFromObject returns a valid bundle", () => {
    const bundle = PolicyBundleLoader.loadFromObject(VALID_BUNDLE);
    expect(bundle.version).toBe("0.1.0");
    expect(bundle.rules).toHaveLength(1);
    expect(bundle.defaults.outcome).toBe("ALLOW");
  });

  test("2. loadFromString parses valid JSON and returns bundle", () => {
    const bundle = PolicyBundleLoader.loadFromString(JSON.stringify(VALID_BUNDLE));
    expect(bundle.rules[0].id).toBe("DENY_TOOL");
  });

  test("3. expired bundle throws", () => {
    const expired = {
      ...VALID_BUNDLE,
      expires_at: "2020-01-01T00:00:00.000Z",
    };
    expect(() => PolicyBundleLoader.loadFromObject(expired)).toThrow(/expired/i);
  });

  test("4. missing required field throws", () => {
    const bad = { ...VALID_BUNDLE, version: undefined };
    expect(() => PolicyBundleLoader.loadFromObject(bad)).toThrow(/version/i);
  });

  test("5. HMAC signature round-trip: sign then verify succeeds", () => {
    const secret = "test-secret-key";
    const signed = PolicyBundleLoader.signBundle({ ...VALID_BUNDLE }, secret);
    expect(signed.signature).toHaveLength(64);
    expect(() => PolicyBundleLoader.loadFromObject(signed, secret)).not.toThrow();
  });

  test("6. HMAC signature mismatch throws", () => {
    const signed = PolicyBundleLoader.signBundle({ ...VALID_BUNDLE }, "correct-secret");
    expect(() => PolicyBundleLoader.loadFromObject(signed, "wrong-secret")).toThrow(
      /signature verification failed/i
    );
  });

  test("7. loadFromFile rejects path traversal outside allowed base", () => {
    const tmpDir = os.tmpdir();
    const file = writeTempBundle(JSON.stringify(VALID_BUNDLE));
    // allowedBasePath is a subdirectory — the file in tmpdir is outside it
    const restrictedBase = path.join(tmpDir, "restricted-subdir");
    fs.mkdirSync(restrictedBase, { recursive: true });
    expect(() =>
      PolicyBundleLoader.loadFromFile(file, { allowedBasePath: restrictedBase })
    ).toThrow(/resolves outside/i);
    fs.unlinkSync(file);
  });
});
