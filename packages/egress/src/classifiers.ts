/**
 * Data classifiers for detecting sensitive information in text.
 */

export type DataClassification = "PII" | "PCI" | "SECRET" | "PHI" | "CUSTOM";

export interface ClassificationResult {
  classification: DataClassification;
  label: string;
  matches: string[];
  confidence: "high" | "medium" | "low";
}

export interface DataClassifier {
  name: string;
  classification: DataClassification;
  classify(text: string): ClassificationResult | null;
}

// --- Built-in classifiers ---

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const CREDIT_CARD_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
const CVV_PATTERN = /\b\d{3,4}\b/; // Too broad alone — used in context
const API_KEY_PATTERN = /\b(?:sk|pk|api|key|token|secret|bearer)[-_]?[A-Za-z0-9]{20,}\b/gi;
const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/;
const AWS_KEY_PATTERN = /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/;
const GENERIC_SECRET_PATTERN = /(?:password|passwd|pwd|secret|api_key|apikey|access_token|auth_token)\s*[=:]\s*['"]?[A-Za-z0-9+/=_-]{8,}['"]?/gi;

export const PII_SSN: DataClassifier = {
  name: "pii-ssn",
  classification: "PII",
  classify(text: string): ClassificationResult | null {
    const matches = text.match(SSN_PATTERN);
    if (!matches) return null;
    return { classification: "PII", label: "SSN", matches: matches.map(m => m.slice(0, 3) + "-**-****"), confidence: "high" };
  },
};

export const PII_EMAIL: DataClassifier = {
  name: "pii-email",
  classification: "PII",
  classify(text: string): ClassificationResult | null {
    const matches = text.match(EMAIL_PATTERN);
    if (!matches) return null;
    return { classification: "PII", label: "Email", matches: matches.map(m => m.replace(/(.{2}).*(@.*)/, "$1***$2")), confidence: "high" };
  },
};

export const PII_PHONE: DataClassifier = {
  name: "pii-phone",
  classification: "PII",
  classify(text: string): ClassificationResult | null {
    const matches = text.match(PHONE_PATTERN);
    if (!matches) return null;
    return { classification: "PII", label: "Phone", matches: matches.map(() => "***-***-****"), confidence: "medium" };
  },
};

export const PCI_CARD_NUMBER: DataClassifier = {
  name: "pci-card-number",
  classification: "PCI",
  classify(text: string): ClassificationResult | null {
    const matches = text.match(CREDIT_CARD_PATTERN);
    if (!matches) return null;
    // Luhn check for higher confidence
    const validated = matches.filter(m => luhnCheck(m.replace(/[-\s]/g, "")));
    if (validated.length === 0) return null;
    return { classification: "PCI", label: "Credit Card", matches: validated.map(m => "****-****-****-" + m.slice(-4)), confidence: "high" };
  },
};

export const SECRET_API_KEY: DataClassifier = {
  name: "secret-api-key",
  classification: "SECRET",
  classify(text: string): ClassificationResult | null {
    const matches = text.match(API_KEY_PATTERN);
    if (!matches) return null;
    return { classification: "SECRET", label: "API Key", matches: matches.map(m => m.slice(0, 6) + "..."), confidence: "high" };
  },
};

export const SECRET_PRIVATE_KEY: DataClassifier = {
  name: "secret-private-key",
  classification: "SECRET",
  classify(text: string): ClassificationResult | null {
    if (!PRIVATE_KEY_PATTERN.test(text)) return null;
    return { classification: "SECRET", label: "Private Key", matches: ["[PRIVATE KEY DETECTED]"], confidence: "high" };
  },
};

export const SECRET_AWS_KEY: DataClassifier = {
  name: "secret-aws-key",
  classification: "SECRET",
  classify(text: string): ClassificationResult | null {
    const matches = text.match(AWS_KEY_PATTERN);
    if (!matches) return null;
    return { classification: "SECRET", label: "AWS Key", matches: matches.map(m => m.slice(0, 4) + "..."), confidence: "high" };
  },
};

export const SECRET_GENERIC: DataClassifier = {
  name: "secret-generic",
  classification: "SECRET",
  classify(text: string): ClassificationResult | null {
    const matches = text.match(GENERIC_SECRET_PATTERN);
    if (!matches) return null;
    return { classification: "SECRET", label: "Generic Secret", matches: matches.map(() => "[SECRET]"), confidence: "medium" };
  },
};

/** All built-in classifiers */
export const DEFAULT_CLASSIFIERS: DataClassifier[] = [
  PII_SSN, PII_EMAIL, PII_PHONE,
  PCI_CARD_NUMBER,
  SECRET_API_KEY, SECRET_PRIVATE_KEY, SECRET_AWS_KEY, SECRET_GENERIC,
];

/**
 * Create a custom classifier from a regex pattern.
 */
export function createCustomClassifier(
  name: string,
  pattern: RegExp,
  label: string,
  classification: DataClassification = "CUSTOM"
): DataClassifier {
  return {
    name,
    classification,
    classify(text: string): ClassificationResult | null {
      const matches = text.match(pattern);
      if (!matches) return null;
      return { classification, label, matches: matches.map(() => `[${label}]`), confidence: "medium" };
    },
  };
}

/** Luhn algorithm for credit card validation */
function luhnCheck(num: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
