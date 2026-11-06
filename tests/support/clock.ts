import type { Clock } from '@/app/ports/clock';

export class MutableClock implements Clock {
  constructor(
    private readonly start: Date,
    private current: Date = start,
  ) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1_000);
  }

  reset(): void {
    this.current = this.start;
  }
}
