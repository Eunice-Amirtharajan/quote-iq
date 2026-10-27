import { describe, expect, it } from "vitest";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { userFacingMessage } from "./graphql-error";

// Shapes as the backend sends them (Nest + Apollo): 400 → code BAD_REQUEST; any other HTTP
// error → code INTERNAL_SERVER_ERROR plus the real status in extensions.status
const graphqlError = (message: string, extensions: Record<string, unknown>) =>
  new CombinedGraphQLErrors({ errors: [{ message, extensions }] });

describe("userFacingMessage", () => {
  it("shows the server message for a 400 (code BAD_REQUEST)", () => {
    expect(
      userFacingMessage(graphqlError("Please ask a question", { code: "BAD_REQUEST" }), "fallback"),
    ).toBe("Please ask a question");
  });

  it.each([429, 503])("shows the server message for an HTTP %d", (status) => {
    expect(
      userFacingMessage(
        graphqlError("Readable message", { code: "INTERNAL_SERVER_ERROR", status }),
        "fallback",
      ),
    ).toBe("Readable message");
  });

  it("uses the fallback for a real server error, which has no status", () => {
    expect(
      userFacingMessage(
        graphqlError('404 {"error":"model_not_found"}', { code: "INTERNAL_SERVER_ERROR" }),
        "fallback",
      ),
    ).toBe("fallback");
  });

  it("uses the fallback for other statuses and errors without a code", () => {
    expect(
      userFacingMessage(
        graphqlError("Quotation q-1 not found", { code: "INTERNAL_SERVER_ERROR", status: 404 }),
        "fallback",
      ),
    ).toBe("fallback");
    expect(userFacingMessage(graphqlError("no code", {}), "fallback")).toBe("fallback");
  });

  it("uses the fallback for network and unknown errors", () => {
    expect(userFacingMessage(new Error("Failed to fetch"), "fallback")).toBe("fallback");
    expect(userFacingMessage(undefined, "fallback")).toBe("fallback");
  });
});
