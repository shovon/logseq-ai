export function filter<T, U extends T>(
  predicate: (el: T) => el is U
): (asyncIterable: AsyncIterable<T>) => AsyncIterable<U>;
export function filter<T>(
  predicate: (el: T) => boolean | Promise<boolean>
): (asyncIterable: AsyncIterable<T>) => AsyncIterable<T>;
export function filter<T>(predicate: (el: T) => unknown) {
  return async function* fn(asyncIterable: AsyncIterable<T>): AsyncIterable<T> {
    for await (const el of asyncIterable) {
      const result = predicate(el);
      if (result instanceof Promise ? await result : result) {
        yield el;
      }
    }
  };
}
