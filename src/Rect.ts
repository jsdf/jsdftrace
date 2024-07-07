import Vec2d, { Vec2dInit } from "./Vec2d";

export type RectInit = {
  position?: Vec2d | Vec2dInit;
  size?: Vec2d | Vec2dInit;
};

export default class Rect {
  position: Vec2d;
  size: Vec2d;

  constructor(init: RectInit = {}) {
    this.position = new Vec2d(init.position);
    this.size = new Vec2d(init.size);
  }

  static fromAABB({ min, max }: { min: Vec2d; max: Vec2d }) {
    return new Rect({ position: min, size: new Vec2d(max).sub(min) });
  }

  containsPoint(point: Vec2d): boolean {
    if (
      // min
      point.x > this.position.x &&
      point.y > this.position.y &&
      // max
      point.x < this.position.x + this.size.x &&
      point.y < this.position.y + this.size.y
    ) {
      return true;
    }
    return false;
  }

  intersectsRect(other: Rect): boolean {
    return collision(this, other);
  }

  clone(): Rect {
    return new Rect({ position: this.position, size: this.size });
  }
}

function collision(a: Rect, b: Rect): boolean {
  // work out the corners (x1,x2,y1,y1) of each rectangle
  // top left
  let ax1 = a.position.x;
  let ay1 = a.position.y;
  // bottom right
  let ax2 = a.position.x + a.size.x;
  let ay2 = a.position.y + a.size.y;
  // top left
  let bx1 = b.position.x;
  let by1 = b.position.y;
  // bottom right
  let bx2 = b.position.x + b.size.x;
  let by2 = b.position.y + b.size.y;

  // test rectangular overlap
  return !(ax1 > bx2 || bx1 > ax2 || ay1 > by2 || by1 > ay2);
}
