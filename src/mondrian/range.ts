export default function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_v, k) => k + start);
}
