import { describe, expect, it } from "vitest";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { userFacingMessage } from "./graphql-error";

const graphqlError = (message: string, code?: string) =>
  new CombinedGraphQLErrors({
    errors: [{ message, extensions: code ? { code } : {} }],
  });

describe("userFacingMessage", () => {
  it.each(["BAD_REQUEST", "SERVICE_UNAVAILABLE"])(
    "shows the server message for %s",
    (code) => {
      expect(
        userFacingMessage(graphqlError("Readable message", code), "fallback"),
      ).toBe("Readable message");
    },
  );

  it("uses the fallback for server errors and errors without a code", () => {
    expect(
      userFacingMessage(
        graphqlError("stack details", "INTERNAL_SERVER_ERROR"),
        "fallback",
      ),
    ).toBe("fallback");
    expect(userFacingMessage(graphqlError("no code"), "fallback")).toBe(
      "fallback",
    );
  });

  it("uses the fallback for network and unknown errors", () => {
    expect(userFacingMessage(new Error("Failed to fetch"), "fallback")).toBe(
      "fallback",
    );
    expect(userFacingMessage(undefined, "fallback")).toBe("fallback");
  });
});
