interface QueueNode<T> {
  value: T;
  next: QueueNode<T> | undefined;
}

export function tee3<T>(
  source: AsyncIterable<T>
): [AsyncIterable<T>, AsyncIterable<T>, AsyncIterable<T>] {
  const [it1, source2] = tee(source);
  const [it2, it3] = tee(source2);

  return [it1, it2, it3];
}

export function tee<T>(
  iterable: AsyncIterable<T>
): [AsyncIterable<T>, AsyncIterable<T>] {
  const source = iterable[Symbol.asyncIterator]();

  // A linked list of enqueued chunks. (The first node has no value.)
  let queue: QueueNode<T> = {
    value: undefined!,
    next: undefined,
  };
  // Which branches have already been closed.
  const closed: [boolean, boolean] = [false, false];
  // Whether we're currently reading from the source.
  let reading = false;
  // Whether the source stream has closed.
  let done = false;
  // A promise for the current read (if reading is true).
  let currentRead: Promise<void> | undefined;

  async function next(): Promise<void> {
    reading = true;
    const result = await source.next();
    if (result.done) {
      done = true;
    } else {
      const nextNode: QueueNode<T> = {
        value: result.value,
        next: undefined,
      };
      queue.next = nextNode;
      queue = nextNode;
    }
    reading = false;
  }

  async function* branch(
    i: 0 | 1,
    buffer: QueueNode<T>
  ): AsyncGenerator<T, undefined, undefined> {
    try {
      while (true) {
        if (buffer.next) {
          buffer = buffer.next;
          yield buffer.value;
        } else if (done) {
          return;
        } else {
          if (!reading) {
            currentRead = next();
          }
          await currentRead;
        }
      }
    } finally {
      closed[i] = true;
      // Close source iterator if both branches are closed
      // Important: don't call return() if next() returned {done: true}!
      if (!done && closed[1 - i]) {
        await source.return?.();
      }
    }
  }

  return [branch(0, queue), branch(1, queue)];
}
