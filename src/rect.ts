export class Rect implements Rect.Immutable {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  copy(): Rect {
    return new Rect(this.x, this.y, this.width, this.height);
  }
  
  isEmpty(): boolean {
    return this.width <= 0 || this.height <= 0;
  }

  static intersection(r1: Rect, r2: Rect) {
    if (
      r1.x + r1.width  <= r2.x ||
      r1.y + r1.height <= r2.y ||
      r2.x + r2.width  <= r1.x ||
      r2.y + r2.height <= r1.y
    ) {
      return new Rect(0, 0, 0, 0);
    }
  
    const left   = Math.max(r1.x, r2.x);
    const top    = Math.max(r1.y, r2.y);
    const right  = Math.min(r1.x + r1.width,  r2.x + r2.width);
    const bottom = Math.max(r1.y + r1.height, r2.y + r2.height);
    return new Rect(left, top, right - left, bottom - top);
  }
}

export namespace Rect {
  export interface Immutable {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    isEmpty(): boolean;
    copy(): Rect;
  }
}