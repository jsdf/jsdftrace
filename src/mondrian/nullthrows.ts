export function nullthrows<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) {
    throw new Error("unexpected null or undefined");
  }
  return x;
}
