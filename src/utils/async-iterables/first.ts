export const first =
  <T>(fn: (value: T) => void) =>
  async (it: AsyncIterable<T>) => {
    for await (const next of it) {
      fn(next);
      return;
    }
  };
