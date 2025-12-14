export const take = <T>(count: number) =>
  async function* fn(asyncIterable: AsyncIterable<T>) {
    let i = 0;
    for await (const el of asyncIterable) {
      if (i >= count) break;
      i++;
      yield el;
    }
  };
