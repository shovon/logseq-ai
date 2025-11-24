import { expect, test, vi } from "vitest";
import { pubSub, pubSubRegistry } from "./pub-sub";

// Tests for pubSubRegistry
test("pubSubRegistry basic allocation returns subject and lastValueEmitted", () => {
  const registry = pubSubRegistry<string, string>();

  expect(registry.isAllocated("foo")).toBe(false);

  const value = registry.allocate("foo");

  expect(registry.isAllocated("foo")).toBe(true);
  expect(value).toHaveProperty("subject");
  expect(value).toHaveProperty("lastValueEmitted");
  expect(value.lastValueEmitted).toBe(null);
  expect(value.subject).toHaveProperty("listen");
  expect(value.subject).toHaveProperty("next");
});

test("pubSubRegistry without initialValue has null lastValueEmitted", () => {
  const registry = pubSubRegistry<string, string>();

  const value = registry.allocate("foo");

  expect(value.lastValueEmitted).toBe(null);
});

test("pubSubRegistry with initialValue sets lastValueEmitted and emits", () => {
  const registry = pubSubRegistry<string, string>({
    initialValue: (key) => `initial-${key}`,
  });

  const listener = vi.fn();
  const _value = registry.allocate("foo");

  // The initial value should have been emitted to any listeners
  _value.subject.listen(listener, true);
  expect(listener).toHaveBeenCalledWith("initial-foo");
  expect(_value.lastValueEmitted).toEqual(["initial-foo"]);
});

test("pubSubRegistry initialValue is called with the key", () => {
  const initialValue = vi.fn((key: string) => `value-${key}`);
  const registry = pubSubRegistry<string, string>({
    initialValue,
  });

  registry.allocate("test-key");

  expect(initialValue).toHaveBeenCalledTimes(1);
  expect(initialValue).toHaveBeenCalledWith("test-key");
});

test("pubSubRegistry multiple allocations return same instance", () => {
  const registry = pubSubRegistry<string, string>();

  const value1 = registry.allocate("foo");
  const value2 = registry.allocate("foo");

  expect(value1).toBe(value2);
  expect(value1.subject).toBe(value2.subject);
});

test("pubSubRegistry different keys return different instances", () => {
  const registry = pubSubRegistry<string, string>();

  const value1 = registry.allocate("foo");
  const value2 = registry.allocate("bar");

  expect(value1).not.toBe(value2);
  expect(value1.subject).not.toBe(value2.subject);
});

test("pubSubRegistry free decrements allocation count", () => {
  const registry = pubSubRegistry<string, string>();

  registry.allocate("foo");
  registry.allocate("foo");

  expect(registry.isAllocated("foo")).toBe(true);

  registry.free("foo");
  expect(registry.isAllocated("foo")).toBe(true); // Still allocated

  registry.free("foo");
  expect(registry.isAllocated("foo")).toBe(false); // Now freed
});

test("pubSubRegistry free non-existent key is safe", () => {
  const registry = pubSubRegistry<string, string>();

  expect(() => registry.free("nonexistent")).not.toThrow();
  expect(registry.isAllocated("nonexistent")).toBe(false);
});

test("pubSubRegistry with shouldCleanup returning false keeps resource", () => {
  const registry = pubSubRegistry<string, string>({
    shouldCleanup: (_key, lastValue) => {
      // Don't cleanup if last value was "persist"
      return lastValue !== "persist";
    },
  });

  const value = registry.allocate("foo");
  value.lastValueEmitted = ["persist"];

  registry.free("foo");

  // Should still be allocated because shouldCleanup returned false
  expect(registry.isAllocated("foo")).toBe(true);
});

test("pubSubRegistry with shouldCleanup returning true cleans up resource", () => {
  const registry = pubSubRegistry<string, string>({
    shouldCleanup: (_key, lastValue) => {
      // Cleanup if last value was "cleanup"
      return lastValue === "cleanup";
    },
  });

  const value = registry.allocate("foo");
  value.lastValueEmitted = ["cleanup"];

  registry.free("foo");

  // Should be cleaned up because shouldCleanup returned true
  expect(registry.isAllocated("foo")).toBe(false);
});

test("pubSubRegistry shouldCleanup receives correct parameters", () => {
  const shouldCleanup = vi.fn((_key: string, _lastValue: string) => true);
  const registry = pubSubRegistry<string, string>({
    shouldCleanup,
  });

  const value = registry.allocate("test-key");
  value.lastValueEmitted = ["test-value"];

  registry.free("test-key");

  expect(shouldCleanup).toHaveBeenCalledTimes(1);
  expect(shouldCleanup).toHaveBeenCalledWith("test-key", "test-value");
});

test("pubSubRegistry should always cleanup if there are no emitted values", () => {
  const shouldCleanup = vi.fn((_key: string, lastValue: string) => {
    expect(lastValue).toBe(null);
    return true;
  });
  const registry = pubSubRegistry<string, string>({
    shouldCleanup,
  });

  registry.allocate("test-key");
  // Don't set lastValueEmitted, keep it as null

  registry.free("test-key");

  expect(shouldCleanup).not.toHaveBeenCalled();
});

test("pubSubRegistry default shouldCleanup behavior is true", () => {
  const registry = pubSubRegistry<string, string>();

  registry.allocate("foo");
  registry.free("foo");

  // Should be cleaned up by default
  expect(registry.isAllocated("foo")).toBe(false);
});

test("pubSubRegistry initialValue emits to subject immediately", () => {
  const registry = pubSubRegistry<string, string>({
    initialValue: (key) => `init-${key}`,
  });

  const listener = vi.fn();
  const value = registry.allocate("foo");

  // Listen with immediate=true to catch the initial emission
  value.subject.listen(listener, true);

  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith("init-foo");
});

test("pubSubRegistry works with different value types", () => {
  const registry = pubSubRegistry<string, number>();

  const value = registry.allocate("numbers");
  expect(value.lastValueEmitted).toBe(null);

  const listener = vi.fn();
  value.subject.listen(listener);
  value.subject.next(42);

  expect(listener).toHaveBeenCalledWith(42);
});

// Tests for pubSub
test("pubSub basic listen and next", () => {
  const mq = pubSub(pubSubRegistry<string, string>());

  const listener = vi.fn();
  const unsubscribe = mq.listen("foo", listener);

  expect(listener).not.toHaveBeenCalled();

  mq.next("foo", "hello");

  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith("hello");

  mq.next("foo", "world");

  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenNthCalledWith(2, "world");

  unsubscribe();
});

test("pubSub next to key with no listeners does nothing", () => {
  const mq = pubSub(pubSubRegistry<string, string>());

  const listener = vi.fn();
  mq.listen("foo", listener);

  // Publish to a different key with no listeners
  mq.next("bar", "hello");

  // Listener should not have been called
  expect(listener).not.toHaveBeenCalled();
});

test("pubSub multiple listeners for same key", () => {
  const mq = pubSub(pubSubRegistry<string, string>());

  const listener1 = vi.fn();
  const listener2 = vi.fn();
  const listener3 = vi.fn();

  const unsubscribe1 = mq.listen("foo", listener1);
  const unsubscribe2 = mq.listen("foo", listener2);
  const unsubscribe3 = mq.listen("foo", listener3);

  mq.next("foo", "hello");

  expect(listener1).toHaveBeenCalledTimes(1);
  expect(listener1).toHaveBeenCalledWith("hello");
  expect(listener2).toHaveBeenCalledTimes(1);
  expect(listener2).toHaveBeenCalledWith("hello");
  expect(listener3).toHaveBeenCalledTimes(1);
  expect(listener3).toHaveBeenCalledWith("hello");

  unsubscribe1();
  unsubscribe2();
  unsubscribe3();
});

test("pubSub multiple keys work independently", () => {
  const mq = pubSub(pubSubRegistry<string, string>());

  const listenerA = vi.fn();
  const listenerB = vi.fn();

  const unsubscribeA = mq.listen("topicA", listenerA);
  const unsubscribeB = mq.listen("topicB", listenerB);

  mq.next("topicA", "messageA");
  mq.next("topicB", "messageB");

  expect(listenerA).toHaveBeenCalledTimes(1);
  expect(listenerA).toHaveBeenCalledWith("messageA");
  expect(listenerB).not.toHaveBeenCalledWith("messageA");
  expect(listenerB).toHaveBeenCalledTimes(1);
  expect(listenerB).toHaveBeenCalledWith("messageB");
  expect(listenerA).not.toHaveBeenCalledWith("messageB");

  unsubscribeA();
  unsubscribeB();
});

test("pubSub unsubscribe removes listener", () => {
  const mq = pubSub(pubSubRegistry<string, string>());

  const listener = vi.fn();
  const unsubscribe = mq.listen("foo", listener);

  mq.next("foo", "hello");
  expect(listener).toHaveBeenCalledTimes(1);

  unsubscribe();

  mq.next("foo", "world");
  // Listener should not receive the second message
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).not.toHaveBeenCalledWith("world");
});

test("pubSub multiple unsubscribes for same key", () => {
  const mq = pubSub(pubSubRegistry<string, string>());

  const listener1 = vi.fn();
  const listener2 = vi.fn();
  const listener3 = vi.fn();

  const unsubscribe1 = mq.listen("foo", listener1);
  const unsubscribe2 = mq.listen("foo", listener2);
  const unsubscribe3 = mq.listen("foo", listener3);

  mq.next("foo", "first");
  expect(listener1).toHaveBeenCalledTimes(1);
  expect(listener2).toHaveBeenCalledTimes(1);
  expect(listener3).toHaveBeenCalledTimes(1);

  unsubscribe1();

  mq.next("foo", "second");
  expect(listener1).toHaveBeenCalledTimes(1); // No new calls
  expect(listener2).toHaveBeenCalledTimes(2);
  expect(listener3).toHaveBeenCalledTimes(2);

  unsubscribe2();

  mq.next("foo", "third");
  expect(listener1).toHaveBeenCalledTimes(1);
  expect(listener2).toHaveBeenCalledTimes(2);
  expect(listener3).toHaveBeenCalledTimes(3);

  unsubscribe3();
});

test("pubSub with initial value no immediate", () => {
  const mq = pubSub(
    pubSubRegistry<string, string>({
      initialValue: (key) => `initial-${key}`,
    })
  );

  const listener = vi.fn();
  const unsubscribe = mq.listen("foo", listener);

  // Listener should not be called immediately (subject doesn't emit initial value by default)
  expect(listener).not.toHaveBeenCalled();

  mq.next("foo", "hello");
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith("hello");

  unsubscribe();
});

test("pubSub with initial value and immediate", () => {
  const mq = pubSub(
    pubSubRegistry<string, string>({
      initialValue: (key) => `initial-${key}`,
    })
  );

  const listener = vi.fn();

  const unsubscribe = mq.listen("foo", listener, true);

  expect(listener).toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith("initial-foo");

  mq.next("foo", "hello");

  // Listener should not be called immediately (subject doesn't emit initial value by default)
  expect(listener).toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenCalledWith("hello");

  unsubscribe();
});

test("pubSub next only emits if key is allocated", () => {
  const mq = pubSub(pubSubRegistry<string, string>());

  // Try to publish to a key with no listeners
  mq.next("unsubscribed", "message");

  // Should not throw, but also shouldn't do anything
  const listener = vi.fn();
  mq.listen("unsubscribed", listener);

  // Now publish again - should work
  mq.next("unsubscribed", "message2");
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith("message2");
});

test("pubSub works with different value types", () => {
  const mq = pubSub(pubSubRegistry<string, number>());

  const listener = vi.fn();
  const unsubscribe = mq.listen("numbers", listener);

  mq.next("numbers", 42);
  expect(listener).toHaveBeenCalledWith(42);

  mq.next("numbers", 100);
  expect(listener).toHaveBeenCalledWith(100);

  unsubscribe();
});

test("pubSub works with object values", () => {
  const mq = pubSub(pubSubRegistry<string, { id: number; name: string }>());

  const listener = vi.fn();
  const unsubscribe = mq.listen("objects", listener);

  const value1 = { id: 1, name: "test" };
  mq.next("objects", value1);
  expect(listener).toHaveBeenCalledWith(value1);

  const value2 = { id: 2, name: "test2" };
  mq.next("objects", value2);
  expect(listener).toHaveBeenCalledWith(value2);

  unsubscribe();
});

test("pubSub with numeric keys", () => {
  const mq = pubSub(pubSubRegistry<number, string>());

  const listener1 = vi.fn();
  const listener2 = vi.fn();

  const unsubscribe1 = mq.listen(1, listener1);
  const unsubscribe2 = mq.listen(2, listener2);

  mq.next(1, "message1");
  mq.next(2, "message2");

  expect(listener1).toHaveBeenCalledWith("message1");
  expect(listener2).toHaveBeenCalledWith("message2");

  unsubscribe1();
  unsubscribe2();
});

test("pubSub cleanup behavior when all listeners unsubscribe", () => {
  const mq = pubSub(pubSubRegistry<string, string>());

  const listener1 = vi.fn();
  const listener2 = vi.fn();

  const unsubscribe1 = mq.listen("foo", listener1);
  const unsubscribe2 = mq.listen("foo", listener2);

  mq.next("foo", "hello");
  expect(listener1).toHaveBeenCalledTimes(1);
  expect(listener2).toHaveBeenCalledTimes(1);

  unsubscribe1();
  unsubscribe2();

  // After all listeners unsubscribe, next should not emit
  mq.next("foo", "world");
  expect(listener1).toHaveBeenCalledTimes(1);
  expect(listener2).toHaveBeenCalledTimes(1);
});

test("pubSub with shouldCleanup option prevents cleanup", () => {
  const registry = pubSubRegistry<string, string>({
    shouldCleanup: (_key, lastValue) => {
      // Don't cleanup if last value was "keep"
      return lastValue !== "keep";
    },
  });
  const mq = pubSub(registry);

  const listener = vi.fn();
  const unsubscribe = mq.listen("foo", listener);

  mq.next("foo", "keep");
  expect(listener).toHaveBeenCalledWith("keep");

  unsubscribe();

  // Since last value was "keep", shouldCleanup returns false, so resource should still be allocated
  expect(registry.isAllocated("foo")).toBe(true);
});

test("pubSub with shouldCleanup option allows cleanup", () => {
  const registry = pubSubRegistry<string, string>({
    shouldCleanup: (_key, lastValue) => {
      // Cleanup if last value was "cleanup"
      return lastValue === "cleanup";
    },
  });
  const mq = pubSub(registry);

  const listener = vi.fn();
  const unsubscribe = mq.listen("foo", listener);

  mq.next("foo", "cleanup");
  expect(listener).toHaveBeenCalledWith("cleanup");

  unsubscribe();

  // Since last value was "cleanup", shouldCleanup returns true, so resource
  // should be cleaned up
  expect(registry.isAllocated("foo")).toBe(false);
});

test("pubSub real-world no added emit", () => {
  type Status = { type: "idle" } | { type: "running" } | { type: "done" };
  const ps = pubSub(
    pubSubRegistry<string, Status>({
      initialValue: () => ({ type: "idle" }),
      shouldCleanup: (_, lastEmittedValue) =>
        lastEmittedValue.type !== "running",
    })
  );

  const listener = vi.fn();

  const unsubscribe = ps.listen("cool", listener, true);

  expect(listener).toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "idle",
    })
  );

  unsubscribe();
});

test("pubSub real-world no added emit", () => {
  type Status = { type: "idle" } | { type: "running" } | { type: "done" };
  const ps = pubSub(
    pubSubRegistry<string, Status>({
      initialValue: () => ({ type: "idle" }),
      shouldCleanup: (_, lastEmittedValue) =>
        lastEmittedValue.type !== "running",
    })
  );

  const listener = vi.fn();

  const unsubscribe = ps.listen("cool", listener, true);

  expect(listener).toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "idle",
    })
  );

  unsubscribe();
});

test("pubSub real-world, with added emit, subscribed after", () => {
  type Status = { type: "idle" } | { type: "running" } | { type: "done" };

  const shouldCleanupListener = vi.fn();

  const ps = pubSub(
    pubSubRegistry<string, Status>({
      initialValue: () => ({ type: "idle" }),
      shouldCleanup: (_, lastEmittedValue) => {
        const shouldClean = lastEmittedValue.type !== "running";
        expect(lastEmittedValue.type).toBe("running");
        expect(shouldClean).toBe(false);
        shouldCleanupListener(shouldClean);
        return shouldClean;
      },
    })
  );

  ps.next("cool", { type: "running" });

  expect(shouldCleanupListener).toHaveBeenCalled();
  expect(shouldCleanupListener).toHaveBeenCalledTimes(1);
  expect(shouldCleanupListener).toHaveBeenCalledWith(false);

  const listener = vi.fn();

  const unsubscribe = ps.listen("cool", listener, true);

  expect(listener).toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "running",
    })
  );

  unsubscribe();
});

test("pubSub real-world, with two added emits, subscribed after both", () => {
  type Status = { type: "idle" } | { type: "running" } | { type: "done" };

  const shouldCleanupListener = vi.fn();

  const ps = pubSub(
    pubSubRegistry<string, Status>({
      initialValue: () => ({ type: "idle" }),
      shouldCleanup: (_, lastEmittedValue) => {
        const shouldClean = lastEmittedValue.type !== "running";
        shouldCleanupListener(shouldClean);
        return shouldClean;
      },
    })
  );

  ps.next("cool", { type: "running" });

  expect(shouldCleanupListener).toHaveBeenCalled();
  expect(shouldCleanupListener).toHaveBeenCalledTimes(1);
  expect(shouldCleanupListener).toHaveBeenCalledWith(false);

  ps.next("cool", { type: "done" });

  expect(shouldCleanupListener).toHaveBeenCalledTimes(2);
  expect(shouldCleanupListener).toHaveBeenCalledWith(true);

  const listener = vi.fn();

  const unsubscribe = ps.listen("cool", listener, true);

  expect(listener).toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "idle",
    })
  );

  unsubscribe();
});

test("pubSub real-world, with two added emits, one subscribed after running, the other after done", () => {
  type Status = { type: "idle" } | { type: "running" } | { type: "done" };

  const shouldCleanupListener = vi.fn();

  const ps = pubSub(
    pubSubRegistry<string, Status>({
      initialValue: () => ({ type: "idle" }),
      shouldCleanup: (_, lastEmittedValue) => {
        const shouldClean = lastEmittedValue.type !== "running";
        shouldCleanupListener(shouldClean);
        return shouldClean;
      },
    })
  );

  ps.next("cool", { type: "running" });

  expect(shouldCleanupListener).toHaveBeenCalled();
  expect(shouldCleanupListener).toHaveBeenCalledTimes(1);
  expect(shouldCleanupListener).toHaveBeenCalledWith(false);

  const listener1 = vi.fn();

  const unsubscribe1 = ps.listen("cool", listener1, true);

  expect(listener1).toHaveBeenCalled();
  expect(listener1).toHaveBeenCalledTimes(1);
  expect(listener1).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "running",
    })
  );

  ps.next("cool", { type: "done" });

  expect(shouldCleanupListener).toHaveBeenCalledTimes(1);
  expect(shouldCleanupListener).toHaveBeenCalledWith(false);

  const listener2 = vi.fn();

  const unsubscribe2 = ps.listen("cool", listener2, true);

  expect(listener2).toHaveBeenCalled();
  expect(listener2).toHaveBeenCalledTimes(1);
  expect(listener2).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "done",
    })
  );

  unsubscribe1();
  unsubscribe2();

  expect(shouldCleanupListener).toHaveBeenCalledTimes(2);
  expect(shouldCleanupListener).toHaveBeenCalledWith(true);
});

test("pubSub real-world, with two added emits, one subscribed after running, the other after done, with first one unsubscribing", () => {
  type Status = { type: "idle" } | { type: "running" } | { type: "done" };

  const shouldCleanupListener = vi.fn();

  const ps = pubSub(
    pubSubRegistry<string, Status>({
      initialValue: () => ({ type: "idle" }),
      shouldCleanup: (_, lastEmittedValue) => {
        const shouldClean = lastEmittedValue.type !== "running";
        shouldCleanupListener(shouldClean);
        return shouldClean;
      },
    })
  );

  ps.next("cool", { type: "running" });

  expect(shouldCleanupListener).toHaveBeenCalled();
  expect(shouldCleanupListener).toHaveBeenCalledTimes(1);
  expect(shouldCleanupListener).toHaveBeenCalledWith(false);

  const listener1 = vi.fn();

  const unsubscribe1 = ps.listen("cool", listener1, true);

  expect(listener1).toHaveBeenCalled();
  expect(listener1).toHaveBeenCalledTimes(1);
  expect(listener1).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "running",
    })
  );

  unsubscribe1();

  expect(shouldCleanupListener).toHaveBeenCalled();
  expect(shouldCleanupListener).toHaveBeenCalledTimes(2);
  expect(shouldCleanupListener).toHaveBeenCalledWith(false);

  ps.next("cool", { type: "done" });

  expect(shouldCleanupListener).toHaveBeenCalledTimes(3);
  expect(shouldCleanupListener).toHaveBeenCalledWith(true);

  const listener2 = vi.fn();

  const unsubscribe2 = ps.listen("cool", listener2, true);

  expect(listener2).toHaveBeenCalled();
  expect(listener2).toHaveBeenCalledTimes(1);
  expect(listener2).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "idle",
    })
  );

  unsubscribe2();
});
