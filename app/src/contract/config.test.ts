import { describe, expect, it } from "vitest";

import { requireRpcEndpoint } from "./config";


describe("GenLayer RPC configuration", () => {
  it("accepts an explicit local simulator endpoint", () => {
    expect(requireRpcEndpoint("http://127.0.0.1:4011/api")).toBe(
      "http://127.0.0.1:4011/api",
    );
  });

  it("rejects non-HTTP endpoint schemes", () => {
    expect(() => requireRpcEndpoint("file:///tmp/rpc")).toThrow(
      "GenLayer RPC endpoint must use HTTP or HTTPS",
    );
  });
});
