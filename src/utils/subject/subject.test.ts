import { expect, test, vi } from "vitest";
import { firstFromSubjectSync, subject } from "./subject";

test("subject listen, next, and unsubscribe", () => {
  const sub = subject<string>();

  const listener = vi.fn();
  const unsubscribe = sub.listen(listener);

  expect(listener).not.toHaveBeenCalled();

  sub.next("hello");

  expect(listener).toHaveBeenNthCalledWith(1, "hello");

  sub.next("world");

  expect(listener).toHaveBeenNthCalledWith(2, "world");
  expect(listener).toHaveBeenCalledTimes(2);

  unsubscribe();

  sub.next("nothing");
  // Assert that listener has only been called for the first two emissions
  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenNthCalledWith(1, "hello");
  expect(listener).toHaveBeenNthCalledWith(2, "world");
  expect(listener).not.toHaveBeenCalledWith("nothing");
});

test("firstFromSubjectSync returns last emitted value synchronously", () => {
  const sub = subject<string>();

  // No value has been emitted yet, so there should be no synchronous value.
  expect(firstFromSubjectSync(sub)).toBeNull();

  // Emit a value and expect it to be captured.
  sub.next("first");
  expect(firstFromSubjectSync(sub)).toEqual(["first"]);

  // Emit another value and ensure the latest one is what we get.
  sub.next("second");
  expect(firstFromSubjectSync(sub)).toEqual(["second"]);
});
