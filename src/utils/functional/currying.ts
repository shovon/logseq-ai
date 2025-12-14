/**
 * Curries the first parameter of a function.
 *
 * @example
 * ```ts
 * const add = (a: number, b: number) => a + b;
 * const curriedAdd = curryFirst(add);
 * const add5 = curriedAdd(5);
 * add5(3); // 8
 * ```
 */
export function curryFirst<First, Rest extends readonly unknown[], Return>(
  fn: (first: First, ...rest: Rest) => Return
): (first: First) => (...rest: Rest) => Return {
  return (first: First) => {
    return (...rest: Rest) => {
      return fn(first, ...rest);
    };
  };
}
