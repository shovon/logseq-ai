export function gate() {
  const listeners = new Set<() => void>();
  let done = false;
  return {
    listen: (listener: () => void) => {
      if (done) listener();
      else listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open: () => {
      if (done) return;
      done = true;
      for (const listener of listeners) {
        listener();
        listeners.delete(listener);
      }
    },
  };
}

export function subscribeToPromise<T>(
  subscribe: (listener: (v: T) => void) => () => void
): Promise<T> {
  return new Promise<T>((resolve) => {
    const unsubscribe = subscribe((v) => {
      resolve(v);
      unsubscribe();
    });
  });
}

// Filter out lines matching "key:: value\n" pattern that are contiguously
// placed in the header
export function filterPropertyLines(content: string): string {
  const lines = content.split("\n");
  const propertyPattern = /^[^:]+::\s*.+$/;

  return lines
    .filter((line) => {
      // Check if this line is a property line
      const isPropertyLine = propertyPattern.test(line);
      return !isPropertyLine;
    })
    .join("\n");
}

/**
 * Take markdown, and looks at any bullet points formatted using the `-` symbol
 * and converts them to `*`.
 *
 * Do not worry, dashes inside codeblocks are ignored.
 * @param markdown Markdown-formatted string.
 */
export function transformDashBulletPointsToStars(markdown: string): string {
  const lines = markdown.split("\n");

  let isInsideCodeblock = false;
  for (const [i, line] of lines.entries()) {
    if (line.trim().startsWith("```")) {
      isInsideCodeblock = !isInsideCodeblock;
    } else {
      if (!isInsideCodeblock && line.trimStart().startsWith("-")) {
        const leadingSpaces = line.match(/^\s*/)?.[0] ?? "";
        const rest = line.trimStart().slice(1);
        lines[i] = leadingSpaces + "*" + rest;
      }
    }
  }

  return lines.join("\n");
}

// TODO: this is very Logseq-specific
/**
 * Convenience helper that applies all markdown sanitization steps used
 * for user/assistant content before persistence:
 * - Converts `-` bullet markers to `*`
 * - Rewrites ATX headings into bold numbered RFC-style text
 */
export function sanitizeMarkdown(markdown: string): string {
  return sanitizeMarkdownHeadersToRfcBullets(
    transformDashBulletPointsToStars(markdown)
  );
}

/**
 * Converts ATX-style markdown headings (`#` through `######`) into
 * RFC-style bold numbered text, e.g.:
 *
 *   # Title      -> **1 Title**
 *   ## Section   -> **1.1 Section**
 *   ### Sub      -> **1.1.1 Sub**
 *
 * The function:
 * - Respects fenced code blocks (```), leaving headings inside untouched.
 * - Is idempotent: already-converted lines are detected and left as-is.
 * - Works line-by-line, preserving non-heading content.
 */
export function sanitizeMarkdownHeadersToRfcBullets(markdown: string): string {
  const lines = markdown.split("\n");

  // Track hierarchical heading numbers; support up to 6 levels
  const counters = [0, 0, 0, 0, 0, 0];
  let insideCodeblock = false;

  // Matches a line that has already been converted to an RFC-style format:
  //   **1 Title**
  //   **1.2.3 Another title**
  const alreadySanitizedPattern = /^(\s*)\*\*[0-9]+(?:\.[0-9]+)*\s+.+\*\*\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    const trimmed = originalLine.trim();

    // Toggle code block state
    if (trimmed.startsWith("```")) {
      insideCodeblock = !insideCodeblock;
      continue;
    }

    if (insideCodeblock) continue;

    // Leave already-sanitized bullets alone (idempotency)
    if (alreadySanitizedPattern.test(originalLine)) {
      continue;
    }

    const headingMatch = originalLine.match(/^(\s*)(#{1,6})\s+(.*)$/);
    if (!headingMatch) continue;

    const leading = headingMatch[1] ?? "";
    const level = headingMatch[2].length; // 1–6
    const headingText = headingMatch[3].trim();

    // Update counters for this heading level
    const idx = Math.min(level, counters.length) - 1;

    // If this is a top-level heading or we jump to a new hierarchy,
    // zero out all deeper levels.
    for (let j = idx + 1; j < counters.length; j++) {
      counters[j] = 0;
    }

    // If there are no previous headings at this or higher level,
    // initialize parents to 1 when necessary so that a first `##` yields `1.1`.
    let hasAnyHigher = false;
    for (let j = 0; j < idx; j++) {
      if (counters[j] > 0) {
        hasAnyHigher = true;
        break;
      }
    }
    if (!hasAnyHigher && idx > 0 && counters[0] === 0) {
      counters[0] = 1;
    }

    counters[idx] += 1;

    const numberParts: number[] = [];
    for (let j = 0; j <= idx; j++) {
      if (counters[j] > 0) {
        numberParts.push(counters[j]);
      }
    }

    const numbering = numberParts.join(".");
    lines[i] = `${leading}**${numbering} ${headingText}**`;
  }

  return lines.join("\n");
}

export type TimePeriod =
  | "today"
  | "yesterday"
  | "past week"
  | "past month"
  | "past year"
  | "older";

/**
 * Categorizes a date into a time period based on when it occurred relative to now.
 * @param date The date to categorize
 * @returns The time period category
 */
export function categorizeDateByPeriod(date: Date): TimePeriod {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateOnly = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  // Calculate difference in days
  const diffInMs = today.getTime() - dateOnly.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return "today";
  } else if (diffInDays === 1) {
    return "yesterday";
  } else if (diffInDays <= 7) {
    return "past week";
  } else if (diffInDays <= 30) {
    return "past month";
  } else if (diffInDays <= 365) {
    return "past year";
  } else {
    return "older";
  }
}

export const debouncePromiseHandler = <T>(
  emitter: (listener: (value: T) => void) => () => void
): ((listener: (value: T) => Promise<void>) => () => void) => {
  let pendingPromise: Promise<void> | null = null;
  let queuedEvent: T | null = null;
  let userListener: ((value: T) => Promise<void>) | null = null;
  let unsubscribe: (() => void) | null = null;

  const processEvent = async (value: T) => {
    if (!userListener) return;

    if (pendingPromise === null) {
      // No promise pending, execute immediately
      pendingPromise = userListener(value);
      await pendingPromise;
      pendingPromise = null;

      // Check if there's a queued event to process
      if (queuedEvent !== null) {
        const nextEvent = queuedEvent;
        queuedEvent = null;
        await processEvent(nextEvent);
      }
    } else {
      // Promise pending, queue the event (replacing any existing queued event)
      queuedEvent = value;
    }
  };

  return (listener) => {
    userListener = listener;
    unsubscribe = emitter(processEvent);
    return () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      userListener = null;
      pendingPromise = null;
      queuedEvent = null;
    };
  };
};
