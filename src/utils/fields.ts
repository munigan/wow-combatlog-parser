// src/utils/fields.ts

/** Remove surrounding double quotes, if present. */
export function stripQuotes(s: string): string {
  if (s.length >= 2 && s.charCodeAt(0) === 34 && s.charCodeAt(s.length - 1) === 34) {
    return s.substring(1, s.length - 1);
  }
  return s;
}

/**
 * Parse a comma-separated field list, respecting double-quoted strings.
 * Quotes are stripped from results. Uses charCodeAt for speed.
 */
export function parseFields(input: string): string[] {
  const fields: string[] = [];
  const len = input.length;
  let i = 0;

  while (i <= len) {
    if (i === len) {
      fields.push("");
      break;
    }

    if (input.charCodeAt(i) === 34) { // '"'
      const closeQuote = input.indexOf('"', i + 1);
      if (closeQuote === -1) {
        fields.push(input.substring(i + 1));
        break;
      }
      fields.push(input.substring(i + 1, closeQuote));
      i = closeQuote + 2; // skip closing quote + comma
    } else {
      const comma = input.indexOf(",", i);
      if (comma === -1) {
        fields.push(input.substring(i));
        break;
      }
      fields.push(input.substring(i, comma));
      i = comma + 1;
    }
  }

  return fields;
}

/**
 * Parse the first `stopAt` comma-separated fields, respecting quotes.
 * Returns { fields, rest } where rest is the unparsed remainder after the
 * stopAt-th field separator. Avoids allocating intermediate strings for
 * fields beyond stopAt.
 */
export function parseFieldsPartial(
  input: string,
  stopAt: number,
): { fields: string[]; rest: string } {
  const fields: string[] = [];
  const len = input.length;
  let i = 0;

  while (i <= len && fields.length < stopAt) {
    if (i === len) {
      fields.push("");
      break;
    }

    if (input.charCodeAt(i) === 34) { // '"'
      const closeQuote = input.indexOf('"', i + 1);
      if (closeQuote === -1) {
        fields.push(input.substring(i + 1));
        i = len;
        break;
      }
      fields.push(input.substring(i + 1, closeQuote));
      i = closeQuote + 2; // skip closing quote + comma
    } else {
      const comma = input.indexOf(",", i);
      if (comma === -1) {
        fields.push(input.substring(i));
        i = len;
        break;
      }
      fields.push(input.substring(i, comma));
      i = comma + 1;
    }
  }

  const rest = i < len ? input.substring(i) : "";
  return { fields, rest };
}
