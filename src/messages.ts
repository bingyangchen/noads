export type RuntimeMessage = { type: "START_PICKER" };

export type RuntimeMessageResponse =
  | { type: "PICKER_STARTED" }
  | { type: "PICKER_UNAVAILABLE"; reason: string };
