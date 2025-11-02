/**
 * Returns an event emitter.
 * @returns An object containing a function to add an event listener, and one
 *   to push events to add to the listener.
 */
export function subject<T>() {
  const listeners = new Set<(v: T) => void>();
  return {
    listen: (listener: <T>(v: T) => void) => {
      listeners.add(listener);
    },
    next: (v: T) => {
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
      done = true;
      for (const listener of listeners) {
        listener();
        listeners.delete(listener);
      }
    },
  };
}

export function subjectWithReplayLast<T>() {
  const listeners = new Set<(v: T) => void>();
  let last: [T] | null = null;
  return {
    listen: (listener: <T>(v: T) => void) => {
      if (last !== null) listener(last);
      listeners.add(listener);
    },
    next: (v: T) => {
      last = [v];
      for (const listener of listeners) {
        listener(v);
      }
    },
  };
}

// Filter out lines matching "key:: value\n" pattern that are contiguously
// placed in the header
export function filterPropertyLines(content: string): string {
  const lines = content.split("\n");
  const propertyPattern = /^[^:]+::\s*.+$/;
  let headerEnded = false;

  return lines
    .filter((line) => {
      // If we've already passed the header section, keep all lines
      if (headerEnded) {
        return true;
      }

      // Check if this line is a property line
      const isPropertyLine = propertyPattern.test(line);

      // If it's a property line, remove it (we're still in the header)
      // If it's not a property line, keep it and mark that the header has ended
      if (!isPropertyLine) {
        headerEnded = true;
      }

      return !isPropertyLine;
    })
    .join("\n");
}
