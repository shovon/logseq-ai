import { it, expect } from "vitest";
import { tee, tee3 } from "./tee";

async function* toAsyncIterable<T>(it: Iterable<T>) {
  for (const el of it) {
    yield await ((el) =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(el);
        });
      }))(el);
  }
}

// Helper to create multiple iterators by chaining tee calls
function teeMultiple<T>(
  source: AsyncIterable<T>,
  count: number
): AsyncIterable<T>[] {
  if (count === 0) return [];
  if (count === 1) {
    const [it1] = tee(source);
    return [it1];
  }
  if (count === 2) {
    return tee(source);
  }
  // For 3+, split and recursively create more from the second branch
  const [it1, it2] = tee(source);
  // Use it1 as the first iterator, and create the rest from it2
  const rest = teeMultiple(it2, count - 1);
  return [it1, ...rest];
}

it("should iterate in order", async () => {
  const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  const source = toAsyncIterable(expected);

  const [it1, it2] = tee(source);

  const arr1 = Array.fromAsync(it1);
  const arr2 = Array.fromAsync(it2);

  expect(await arr1).toEqual(expected);
  expect(await arr2).toEqual(expected);
});

it("should iterate in order", async () => {
  const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  const source = toAsyncIterable(expected);

  const [it1, it2, it3] = teeMultiple(source, 3);

  const arr1 = Array.fromAsync(it1);
  const arr2 = Array.fromAsync(it2);
  const arr3 = Array.fromAsync(it3);

  expect(await arr1).toEqual(expected);
  expect(await arr2).toEqual(expected);
  expect(await arr3).toEqual(expected);
});

it("should iterate in order", async () => {
  const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  const source = toAsyncIterable(expected);

  const [it1, it2, it3] = tee3(source);

  const arr1 = Array.fromAsync(it1);
  const arr2 = Array.fromAsync(it2);
  const arr3 = Array.fromAsync(it3);

  expect(await arr1).toEqual(expected);
  expect(await arr2).toEqual(expected);
  expect(await arr3).toEqual(expected);
});

it("should iterate in order", async () => {
  const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  const source = toAsyncIterable(expected);

  const [it1, it2, it3, it4] = teeMultiple(source, 4);

  const arr1 = Array.fromAsync(it1);
  const arr2 = Array.fromAsync(it2);
  const arr3 = Array.fromAsync(it3);
  const arr4 = Array.fromAsync(it4);

  expect(await arr1).toEqual(expected);
  expect(await arr2).toEqual(expected);
  expect(await arr3).toEqual(expected);
  expect(await arr4).toEqual(expected);
});

it("should iterate in order", async () => {
  const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  const source = toAsyncIterable(expected);

  const [it1, _it2] = tee(source);
  const [it2, it3] = tee(_it2);

  const arr1 = Array.fromAsync(it1);
  const arr2 = Array.fromAsync(it2);
  const arr3 = Array.fromAsync(it3);

  expect(await arr1).toEqual(expected);
  expect(await arr2).toEqual(expected);
  expect(await arr3).toEqual(expected);
});
