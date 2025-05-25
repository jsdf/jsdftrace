export type Color = [number, number, number, number];

export function getRandomColor(): Color {
  return [
    1 - Math.random() * 0.5,
    1 - Math.random() * 0.7,
    1 - Math.random() * 0.3,
    1.0,
  ];
}
