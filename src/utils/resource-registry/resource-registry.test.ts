import { expect, test, vi } from "vitest";
import { resourceRegistry } from "./resource-registry";

test("resourceRegistry basic allocation and freeing", () => {
  const registry = resourceRegistry((key: number) => `value-${key}`);

  expect(registry.isAllocated(10)).toBe(false);

  const value1 = registry.allocate(10);
  expect(value1).toBe("value-10");
  expect(registry.isAllocated(10)).toBe(true);

  const value2 = registry.allocate(10);
  expect(value2).toBe("value-10");
  expect(value1).toBe(value2); // Should return the same instance
  expect(registry.isAllocated(10)).toBe(true);

  registry.free(10);
  // After one free, should still be allocated (count was 2, now 1)
  expect(registry.isAllocated(10)).toBe(true);

  registry.free(10);
  // After second free, should be cleaned up (count was 1, now 0)
  expect(registry.isAllocated(10)).toBe(false);
});

test("resourceRegistry multiple keys", () => {
  const registry = resourceRegistry((key: string) => ({ id: key }));

  const valueA = registry.allocate("a");
  const valueB = registry.allocate("b");

  expect(valueA.id).toBe("a");
  expect(valueB.id).toBe("b");
  expect(registry.isAllocated("a")).toBe(true);
  expect(registry.isAllocated("b")).toBe(true);

  registry.free("a");
  expect(registry.isAllocated("a")).toBe(false);
  expect(registry.isAllocated("b")).toBe(true);

  registry.free("b");
  expect(registry.isAllocated("b")).toBe(false);
});

test("resourceRegistry free non-existent key is safe", () => {
  const registry = resourceRegistry((key: number) => key * 2);

  expect(() => registry.free(999)).not.toThrow();
  expect(registry.isAllocated(999)).toBe(false);
});

test("resourceRegistry with shouldCleanup returning false", () => {
  const registry = resourceRegistry(
    (key: number) => ({ key, data: "test" }),
    (_, value) => value.key !== 5 // Don't cleanup key 5
  );

  registry.allocate(5);
  expect(registry.isAllocated(5)).toBe(true);

  registry.free(5);
  // Should still be allocated because shouldCleanup returned false
  expect(registry.isAllocated(5)).toBe(true);

  registry.allocate(10);
  registry.free(10);
  // Should be cleaned up because shouldCleanup returns true (default)
  expect(registry.isAllocated(10)).toBe(false);
});

test("resourceRegistry with shouldCleanup conditional cleanup", () => {
  const registry = resourceRegistry(
    (key: number) => ({ key }),
    (_, value) => value.key <= 100 // Only cleanup keys <= 100
  );

  registry.allocate(50);
  registry.free(50);
  // Should be cleaned up because shouldCleanup returns true for key 50
  expect(registry.isAllocated(50)).toBe(false);

  registry.allocate(150);
  registry.free(150);
  // Should still be allocated because shouldCleanup returned false for key 150
  expect(registry.isAllocated(150)).toBe(true);
});

test("resourceRegistry initialize function is called only once per key", () => {
  const initialize = vi.fn((key: number) => `value-${key}`);
  const registry = resourceRegistry(initialize);

  registry.allocate(10);
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(initialize).toHaveBeenCalledWith(10);

  registry.allocate(10);
  // Should not call initialize again for the same key
  expect(initialize).toHaveBeenCalledTimes(1);

  registry.allocate(20);
  expect(initialize).toHaveBeenCalledTimes(2);
  expect(initialize).toHaveBeenCalledWith(20);
});

test("resourceRegistry free multiple times on same key", () => {
  const registry = resourceRegistry((key: number) => key);

  registry.allocate(10);
  registry.free(10);
  expect(registry.isAllocated(10)).toBe(false);

  // Freeing again should be safe
  registry.free(10);
  expect(registry.isAllocated(10)).toBe(false);
});

test("resourceRegistry allocate should return the same value for the same key", () => {
  const registry = resourceRegistry((key: number) => ({ id: key }));

  const valueA = registry.allocate(10);
  const valueB = registry.allocate(10);
  const valueC = registry.allocate(20);

  expect(valueA).toBe(valueB);
  expect(valueA).not.toBe(valueC);
  expect(valueB).not.toBe(valueC);
});
