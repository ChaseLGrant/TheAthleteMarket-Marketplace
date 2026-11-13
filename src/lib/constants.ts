export const BRAND = "The Athlete Market";

export const DIVISIONS = [
  "NCAA D1",
  "NCAA D2",
  "NCAA D3",
  "NAIA",
  "NJCAA",
  "CCCAA",
  "Professional",
  "Independent",
] as const;

export const SPORTS = [
  "Baseball",
  "Basketball (M)",
  "Basketball (W)",
  "Cross Country / Track",
  "Football",
  "Golf",
  "Lacrosse (M)",
  "Lacrosse (W)",
  "Soccer (M)",
  "Soccer (W)",
  "Softball",
  "Swimming & Diving",
  "Tennis",
  "Volleyball (M)",
  "Volleyball (W)",
  "Wrestling",
  "Ice Hockey",
  "Field Hockey",
  "Rowing",
  "Water Polo",
] as const;

export const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** Recording target, in seconds. */
export const VIDEO_MIN_SECONDS = 10;
export const VIDEO_TARGET_MIN = 30;
export const VIDEO_TARGET_MAX = 60;
export const VIDEO_HARD_MAX_SECONDS = 180;
export const VIDEO_MIN_BYTES = 50_000;
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/3gpp"];

export const OPEN_STATUSES = ["paid", "coach_notified", "accepted"] as const;

export const DISCLAIMER =
  "An evaluation is one coach's personal feedback on your film. It is not a recruiting contact, offer, " +
  "scholarship, admission decision, or roster spot, and no coach or institution is endorsing The Athlete Market.";
