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
