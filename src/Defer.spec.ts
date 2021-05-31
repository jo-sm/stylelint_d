import { Defer } from "./Defer";

describe("Defer", () => {
  it("should resolve the promise once the instance resolve method is called", async () => {
    const defer = new Defer<string>();

    defer.resolve("success");

    await expect(defer.promise).resolves.toBe("success");
  });

  it("should reject the promise once the instance reject method is called", async () => {
    const err = new Error("oops");
    const defer = new Defer<string>();

    defer.reject(err);

    await expect(defer.promise).rejects.toBe(err);
  });
});
