export const forEach =
  <T>(it: (el: T) => void | Promise<void>) =>
  async (asyncIterable: AsyncIterable<T>) => {
    for await (const el of asyncIterable) {
      await it(el);
    }
  };
