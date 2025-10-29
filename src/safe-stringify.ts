/**
 * Safe JSON stringify with circular reference protection
 *
 * Handles cases where objects contain circular references that would normally
 * cause JSON.stringify to throw.
 *
 * Usage:
 *   const obj = { a: 1 };
 *   obj.self = obj; // circular reference
 *   const json = safeStringify(obj); // works!
 */

export function safeStringify(
  value: any,
  replacer?: (key: string, value: any) => any,
  space?: string | number
): string {
  const seen = new WeakSet();

  const defaultReplacer = (_key: string, val: any) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) {
        return "[Circular]";
      }
      seen.add(val);
    }
    return val;
  };

  const finalReplacer = replacer ? (key: string, val: any) => {
    // Apply user's replacer first
    const replaced = replacer(key, val);

    // Then apply circular reference check
    if (typeof replaced === "object" && replaced !== null) {
      if (seen.has(replaced)) {
        return "[Circular]";
      }
      seen.add(replaced);
    }
    return replaced;
  } : defaultReplacer;

  return JSON.stringify(value, finalReplacer, space);
}

/**
 * Safe stringify that also handles undefined values
 * Useful for logging where undefined might appear
 */
export function safeStringifyWithUndefined(
  value: any,
  space?: string | number
): string {
  const seen = new WeakSet();

  const replacer = (_key: string, val: any) => {
    if (val === undefined) {
      return "[undefined]";
    }

    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) {
        return "[Circular]";
      }
      seen.add(val);
    }
    return val;
  };

  return JSON.stringify(value, replacer, space);
}
