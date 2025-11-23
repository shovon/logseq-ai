import { expect, test, vi } from "vitest";
import { gate } from "./utils";

test("gate allows and blocks as expected", () => {
  const g = gate();

  const listenerA = vi.fn();
  const listenerB = vi.fn();
  const unsubscribeA = g.listen(listenerA);
  g.listen(listenerB);

  expect(listenerA).not.toHaveBeenCalled();
  expect(listenerB).not.toHaveBeenCalled();

  unsubscribeA();

  g.open();

  expect(listenerA).not.toHaveBeenCalled();
  expect(listenerB).toHaveBeenCalledTimes(1);

  g.open(); // second open is a no-op

  expect(listenerB).toHaveBeenCalledTimes(1);

  const lateListener = vi.fn();
  const unsubscribeLate = g.listen(lateListener);

  expect(lateListener).toHaveBeenCalledTimes(1);

  unsubscribeLate();
});
