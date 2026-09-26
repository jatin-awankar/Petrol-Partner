import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../app";

describe("verification HTTP status", () => {
  it("reports SMS verification as suspended for the pilot", async () => {
    const response = await request(createApp()).get("/v1/verification/_status");

    expect(response.status).toBe(200);
    expect(response.body.smsVerification).toBe("suspended");
  });
});
