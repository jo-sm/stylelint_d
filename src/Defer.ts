type Resolve<T> = (value?: T) => void;
type Reject = (error?: any) => void;

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
