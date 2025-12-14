export const reduce = <T, V>(
  reducer: (accum: V, next: T) => V | Promise<V>,
  initial: V
) =>
  async function* fn(asyncIterable: AsyncIterable<T>) {
    let accum = initial;
    for await (const next of asyncIterable) {
      accum = await reducer(accum, next);
      yield accum;
    }
  };
