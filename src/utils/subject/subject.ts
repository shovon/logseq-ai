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

export const firstFromSubjectSync = <T>(
  sub: ReturnType<typeof subject<T>>
): [T] | null => {
  let value: [T] | null = null;
  const unsubscibe = sub.listen((v) => {
    value = [v];
  }, true);
  unsubscibe();
  return value;
};
