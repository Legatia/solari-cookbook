/**
 * The conversation stays casual; the evidence lives in the control room. These
 * links are the bridge between the two, so a reply can stay short and still
 * offer somewhere real to look.
 */
export const CONTROL_ROOM_VIEWS = [
  "overview",
  "memory",
  "connections",
  "workspace",
  "account",
] as const;

export type ControlRoomView = (typeof CONTROL_ROOM_VIEWS)[number];

export function controlRoomUrl(view: ControlRoomView = "overview") {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/app?view=${view}`;
}

export function isControlRoomView(value: string | null): value is ControlRoomView {
  return CONTROL_ROOM_VIEWS.includes((value ?? "") as ControlRoomView);
}

/**
 * A short, speakable pointer. The host reads `say` aloud and offers `url`; it
 * should never recite provider names, session ids, or lifecycle flags.
 */
export function viewAt(view: ControlRoomView, say: string) {
  return { say, url: controlRoomUrl(view) };
}
