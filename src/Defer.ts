type Resolve<T> = (value?: T) => void;
type Reject = (error?: any) => void;

/**
 * A simple wrapper around a promise, exposing the promise and its methods in
 * such a way that you don't need to either do the boilerplate of raising the
 * resolve and reject functions yourself or wrap everything in a promise.
 * Particularly useful when dealing with event listeners.
 *
 * Usage:
 *
 * ```
 * async function(): Promise<any> {
 *   const defer = new Defer();
 *
 *   const event = new net.Socket();
 *
 *   event.on('end', () => {
 *     defer.resolve();
 *   });
 *
 *   return defer.promise;
 * }
 * ```
 */
export class Defer<T> {
  readonly promise: Promise<T>;
  readonly resolve: Resolve<T>;
  readonly reject: Reject;

  constructor() {
    let resolve: unknown;
    let reject: unknown;

    this.promise = new Promise<T>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    this.resolve = resolve as Resolve<T>;
    this.reject = reject as Reject;
  }
}
