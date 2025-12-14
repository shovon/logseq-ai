export const map = <T, V>(mapper: (el: T) => V | Promise<V>) =>
  async function* fn(asyncIterable: AsyncIterable<T>) {
    for await (const el of asyncIterable) {
      yield await mapper(el);
    }
  };
