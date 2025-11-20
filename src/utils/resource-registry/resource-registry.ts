/**
 * Initializes a resource registry, that will allow consumers to share and
 * access a single resource keyed by a key.
 *
 * Usage:
 *
 *     const registry = resourceRegistry((key) => key);
 *
 *     console.log(registry.isAllocated(10)); // false
 *
 *     registry.allocate(10);
 *
 *     console.log(registry.isAllocated(10)); // true;
 *
 *     registry.allocate(10);
 *
 *     registry.free(10);
 *
 *     console.log(registry.isAllocated(10)); // true
 *
 *     registry.free(10);
 *
 *     console.log(registry.isAllocated(10)); // false
 * @param initialize a function to initialize the first value, if one doesn't
 *   yet exist.
 * @param shouldCleanup An optional predicate function to determine whether to
 *   clear the resource.
 * @returns An object with two key methods: `allocate` and `free`, where
 *   `allocate` either initializes the resource, or gives an existing one to the
 *   consumer, and `free` notiifies the registry to indicate there is one less
 *   consumer of a resource.
 */
export function resourceRegistry<Key, Value>(
  initialize: (key: Key) => Value,
  shouldCleanup?: (key: Key, value: Value) => boolean
) {
  const allocations = new Map<
    Key,
    {
      allocationCount: number;
      value: Value;
    }
  >();

  return {
    allocate: (key: Key): Value => {
      let value = allocations.get(key);
      if (!value) {
        value = {
          allocationCount: 1,
          value: initialize(key),
        };
        allocations.set(key, value);
      } else {
        value.allocationCount += 1;
      }
      return value.value;
    },
    free: (key: Key): void => {
      const value = allocations.get(key);
      if (!value) return;
      value.allocationCount =
        value.allocationCount === 0 ? 0 : value.allocationCount - 1;
      if (
        value.allocationCount === 0 &&
        (shouldCleanup?.(key, value.value) ?? true)
      ) {
        allocations.delete(key);
      }
    },
    isAllocated: (key: Key): boolean => allocations.has(key),
  };
}
