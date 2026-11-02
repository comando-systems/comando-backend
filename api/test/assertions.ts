// Shared error-code assertions used by unit tests.
import { expect } from "bun:test";

/** Asserts that a synchronous operation throws the expected stable error code. */
export function expectCode(work: () => unknown, code: string): void {
  try {
    work();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }

  throw new Error(`Expected error with code ${code}`);
}

/** Asserts that an asynchronous operation rejects with the expected error code. */
export async function expectRejectedCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }

  throw new Error(`Expected error with code ${code}`);
}
