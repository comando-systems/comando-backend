export interface IdGenerator {
  next(): Promise<string>;
}
