import { Defer } from "./Defer";

describe("Defer", () => {
  it("should resolve the promise once the instance resolve method is called", () => {
    const defer = new Defer<string>();

    defer.resolve("success");

    expect(defer.promise).resolves.toBe("success");
  });

  it("should reject the promise once the instance reject method is called", () => {
    const err = new Error("oops");
    const defer = new Defer<string>();

    defer.reject(err);

    expect(defer.promise).rejects.toBe(err);
  });
});
