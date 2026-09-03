import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { controlRoomUrl, isControlRoomView, viewAt } from "./control-room";

const originalBaseUrl = process.env.APP_BASE_URL;

describe("control room links", () => {
  beforeEach(() => {
    process.env.APP_BASE_URL = "https://sylla.example";
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = originalBaseUrl;
  });

  it("addresses a specific section rather than the app root", () => {
    expect(controlRoomUrl("memory")).toBe("https://sylla.example/app?view=memory");
    expect(controlRoomUrl()).toBe("https://sylla.example/app?view=overview");
  });

  it("does not double a slash when the base url has a trailing one", () => {
    process.env.APP_BASE_URL = "https://sylla.example/";
    expect(controlRoomUrl("workspace")).toBe(
      "https://sylla.example/app?view=workspace",
    );
  });

  it("only accepts sections the control room actually renders", () => {
    expect(isControlRoomView("memory")).toBe(true);
    expect(isControlRoomView("evidence")).toBe(false);
    expect(isControlRoomView(null)).toBe(false);
  });

  it("pairs something speakable with the link", () => {
    const pointer = viewAt("memory", "Where they approve or forget it.");
    expect(pointer.say).toBe("Where they approve or forget it.");
    expect(pointer.url).toContain("view=memory");
  });
});
