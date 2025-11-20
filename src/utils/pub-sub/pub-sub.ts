import { resourceRegistry } from "../resource-registry/resource-registry";
import { subject } from "../subject/subject";

/**
 * A type that pairs a subject with its last emitted value.
 *
 * This type is used to enable pub-sub functionality while also maintaining
 * the last emitted value, allowing the pub-sub system to double as a key-value
 * store where the "value" is the last event emitted for a given topic.
 *
 * @template Value The type of value that the subject emits and stores.
 */
type SubjectAndLastValue<Value> = {
  /**
   * The last value that was emitted by the subject,
   * stored as a single-element tuple `[Value]`, or `null` if no value has been
   * emitted yet.
   */
  lastValueEmitted: [Value] | null;

  /**
   * The subject instance that manages subscriptions and
   * emits values to listeners.
   */
  subject: ReturnType<typeof subject<Value>>;
};

/**
 * This function is a helper for initializing a "resource registry" purely for
 * usecases that involve pub-sub (especially within a same-process/in-memory
 * pub-sub manager).
 *
 * The first advantage is that the return value matches the parameter type of
 * what `pubSub` expects.
 *
 * The other advantage is that unlike `resourceRegistry`'s initialization logic,
 * this function has it so that when a subject is initialized, a newly-created
 * subject will always have an initial value emitted, if an `initialValue`
 * function was supplied in the option.
 *
 * This aspect is especially useful if we are to double pub-sub as a key-value
 * store, that associates "last event" as a "value" in the key-value pair.
 * @param options An object of optional methods, those being `initialValue` and
 *   `shouldCleanup`. Initial value decides the initial value to emit when a
 *   new subject has been initialized. A subject is initialized either when the
 *   resource registry has initialized, or when a subject has been cleaned out.
 * @returns A "resource registry"
 * @see resourceRegistry
 * @see pubSub
 */
export function pubSubRegistry<Key, Value>({
  initialValue,
  shouldCleanup,
}: {
  initialValue?: (key: Key) => Value;
  shouldCleanup?: (key: Key, event: Value) => boolean;
} = {}) {
  return resourceRegistry<Key, SubjectAndLastValue<Value>>(
    (key) => {
      const sub = subject<Value>();
      const init = initialValue
        ? ([initialValue(key)] satisfies [Value])
        : null;
      if (init !== null) {
        sub.next(init[0]);
      }
      return {
        lastValueEmitted: init,
        subject: sub,
      };
    },

    (key, event) => {
      if (event.lastValueEmitted === null) return true;
      return shouldCleanup?.(key, event.lastValueEmitted[0]) ?? true;
    }
  );
}

/**
 * Returns a pub/sub registry that is intended to subscribe to a topic, and
 * publish to it.
 *
 * Usage:
 *
 *     const mq = pubSub<string, string>(pubSubRegistry());
 *
 *     mq.listen('foo', (value) => console.log(`${value}`));
 *
 *     mq.next('foo', 'hello'); // Should have emitted "hello"
 *
 *     mq.next('bar', 'hello'); // Nothing, because no subscriber to `bar`.
 *
 *     mq.next('foo', world'); // Should have emitted "world"
 * @param options allows one to provide an optional "initial value" provider,
 *   and a predicate function to determine whether to clear out the subject
 *   when all listeners have unsubscribed.
 * @returns An object that contains a `listen` and a `next` method, where
 *   `listen` allows the client code to listen to events to a specific topic
 *   (keyed by `key`), and `next` allows the client code to emit an event to all
 *   listeners.
 */
export function pubSub<Key, Value>(
  registry: ReturnType<typeof resourceRegistry<Key, SubjectAndLastValue<Value>>>
) {
  const listen = (
    key: Key,
    listener: (value: Value) => void,
    immediate?: boolean
  ): (() => void) => {
    const subjectAndLastValue = registry.allocate(key);
    const unsubscribe = subjectAndLastValue.subject.listen(listener, immediate);

    return () => {
      registry.free(key);
      unsubscribe();
    };
  };
  const next = (key: Key, value: Value) => {
    const subjectAndLastValue = registry.allocate(key);
    subjectAndLastValue.lastValueEmitted = [value];
    registry.free(key);
    subjectAndLastValue.subject.next(value);
  };

  return {
    listen,
    next,
    subject: (key: Key): ReturnType<typeof subject<Value>> => ({
      listen: (...args) => listen(key, ...args),
      next: (...args) => next(key, ...args),
    }),
  };
}
