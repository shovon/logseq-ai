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
