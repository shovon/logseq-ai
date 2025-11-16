/**
 * Returns an event emitter.
 * @returns An object containing a function to add an event listener, and one
 *   to push events to add to the listener.
 */
export function subject<T>() {
  const listeners = new Set<(v: T) => void>();
  let last: [T] | null = null;
  return {
    listen: (listener: (v: T) => void, immediate = false) => {
      if (last !== null && immediate) listener(last[0]);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    next: (v: T) => {
      last = [v];
      for (const listener of listeners) {
        listener(v);
      }
    },
  };
}

export function gate() {
  const listeners = new Set<() => void>();
  let done = false;
  return {
    listen: (listener: () => void) => {
      if (done) listener();
      else listeners.add(listener);
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
 * Take markdown, and looks at any bullet points foramatted using the `-` symbol
 * and converts them to `*`.
 *
 * Do not worry, dashes inside codeblocks are ignored.
 * @param markdown Markdown-formatted string.
 */
export function transformDashBulletPointsToStars(markdown: string): string {
  const lines = markdown.split("\n");

  let isInsideCodeboock = false;
  for (const line of lines) {
    if (line.trim() === "```") {
      isInsideCodeboock = !isInsideCodeboock;
    } else {
      if (!isInsideCodeboock && line.trimStart().startsWith("-")) {
        const leadingSpaces = line.match(/^\s*/)?.[0] ?? "";
        const rest = line.trimStart().slice(1);
        lines[lines.indexOf(line)] = leadingSpaces + "*" + rest;
      }
    }
  }

  return lines.join("\n");
}
