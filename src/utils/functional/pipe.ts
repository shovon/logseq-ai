type Pipe<T> = {
  pipe<V>(fn: (value: T) => V): Pipe<V>;
  readonly value: T;
};

export function start<T>(initial: T): Pipe<T> {
  return {
    pipe: (fn) => start(fn(initial)),
    get value() {
      return initial;
    },
  };
}
