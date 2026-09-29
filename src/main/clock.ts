/** Nguồn "bây giờ" duy nhất của main — kiểm thử thay bằng TestClock để đẩy thời gian tới */
export interface Clock {
  now(): number
}

export const systemClock: Clock = { now: () => Date.now() }

/** Đồng hồ kiểm thử: lệch khỏi giờ thật một khoảng, đẩy tới được */
export class TestClock implements Clock {
  constructor(private offset = 0) {}

  now(): number {
    return Date.now() + this.offset
  }

  advance(ms: number): void {
    this.offset += ms
  }

  get offsetMs(): number {
    return this.offset
  }
}
