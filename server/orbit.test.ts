import { describe, expect, it } from "vitest";
import { canViewWellnessEntry, getRelationshipElapsed, isPairScopedRecord } from "../shared/orbit";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function authenticatedContext(): TrpcContext {
  return {
    user: {
      id: 41,
      openId: "orbit-test-member",
      email: "member@example.com",
      name: "Orbit Test Member",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("private orbit helpers", () => {
  it("calculates a continuously usable elapsed relationship duration", () => {
    const start = new Date("2025-01-01T00:00:00.000Z");
    const now = new Date("2025-01-03T02:04:09.000Z").getTime();
    expect(getRelationshipElapsed(start, now)).toEqual({
      elapsedMilliseconds: 180_249_000,
      days: 2,
      hours: 2,
      minutes: 4,
      seconds: 9,
    });
  });

  it("never returns a negative relationship duration", () => {
    expect(getRelationshipElapsed("2025-01-03T00:00:00.000Z", new Date("2025-01-01T00:00:00.000Z").getTime()).days).toBe(0);
  });

  it("limits wellness visibility to its owner unless explicit partner sharing is enabled", () => {
    expect(canViewWellnessEntry(1, false, 1)).toBe(true);
    expect(canViewWellnessEntry(1, false, 2)).toBe(false);
    expect(canViewWellnessEntry(1, true, 2)).toBe(true);
  });

  it("rejects a shared record from another private orbit", () => {
    expect(isPairScopedRecord(8, 8)).toBe(true);
    expect(isPairScopedRecord(8, 9)).toBe(false);
  });

  it("rejects unauthenticated access to the private relationship procedure", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    await expect(caller.orbit.relationship.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects malformed partner invitations before any private data lookup", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.orbit.relationship.previewInvite({ token: "too-short" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid wellness calendar dates before a protected record can be written", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.orbit.wellness.create({
      entryDate: "not-a-date",
      entryType: "cycle",
      value: "period start",
      shareWithPartner: false,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a shared period entry whose end date comes before its start date", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.orbit.wellness.create({
      entryDate: "2026-08-20",
      periodEndDate: "2026-08-19",
      cycleLength: 28,
      entryType: "cycle",
      value: "Period",
      shareWithPartner: true,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects period dates attached to a non-cycle wellness entry", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.orbit.wellness.create({
      entryDate: "2026-08-20",
      periodEndDate: "2026-08-22",
      entryType: "mood",
      value: "calm",
      shareWithPartner: false,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects cycle lengths outside the privacy-safe input range", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.orbit.wellness.create({
      entryDate: "2026-08-20",
      cycleLength: 12,
      entryType: "cycle",
      value: "Period",
      shareWithPartner: false,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unsupported Moments media types before a storage upload can begin", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.orbit.moments.create({
      filename: "memory.bmp",
      mimeType: "image/bmp",
      dataUrl: "data:image/bmp;base64,AA==",
      occurredAt: new Date(),
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects malformed owner-edit inputs before a private record can be updated", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.orbit.moments.update({ id: 0, caption: "Updated", occurredAt: new Date() })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.orbit.feelings.update({ id: 0, mood: "calm", note: "Updated", visibility: "private" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("blocks unauthenticated edits of shared and personal records", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(caller.orbit.moments.update({ id: 1, caption: "Updated", occurredAt: new Date() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.orbit.feelings.update({ id: 1, mood: "calm", note: "Updated", visibility: "private" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.orbit.wellness.update({ id: 1, entryDate: "2026-08-20", entryType: "cycle", value: "Period", shareWithPartner: false })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
