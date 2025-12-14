/**
 * Creates a memoized version of a function that caches results based on arguments.
 * This is a naive implementation that uses JSON.stringify for cache keys.
 *
 * @example
 * ```ts
 * const expensiveFn = (x: number, y: number) => {
 *   console.log('Computing...');
 *   return x + y;
 * };
 * const memoized = memoize(expensiveFn);
 * memoized(1, 2); // logs "Computing..." and returns 3
 * memoized(1, 2); // returns 3 (cached, no log)
 * ```
 */
export function memoize<Args extends readonly unknown[], Return>(
  fn: (...args: Args) => Return
): (...args: Args) => Return {
  const cache = new Map<string, Return>();

  return (...args: Args): Return => {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}
