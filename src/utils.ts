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
