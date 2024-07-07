export type Vec2dInit = { x?: number; y?: number };
export default class Vec2d {
  x: number;
  y: number;
  constructor(init: Vec2dInit = {}) {
    this.x = init.x ?? 0;
    this.y = init.y ?? 0;
  }

  clone() {
    return new Vec2d(this);
  }

  copyFrom(init: Vec2dInit = {}) {
    this.x = init.x ?? 0;
    this.y = init.y ?? 0;
    return this;
  }

  origin() {
    this.x = 0;
    this.y = 0;
  }

  add(other: Vec2d) {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  sub(other: Vec2d) {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  mul(other: Vec2d) {
    this.x *= other.x;
    this.y *= other.y;
    return this;
  }

  div(other: Vec2d) {
    this.x /= other.x;
    this.y /= other.y;
    return this;
  }

  distanceTo(other: Vec2d) {
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
  }

  toJSON() {
    return { x: this.x, y: this.y };
  }
}
