/**
 * "Coach's Take": the structured, personal part of every Coach Line answer.
 * Shared by the coach answer page (browser) and the family's email (server).
 */

/** Report card: the tools/skills a coach rates 1–10, by sport (and pitcher vs position player). */
export type Tool = { key: string; label: string };
export type ReportLine = { key: string; label: string; value: number | null }; // null = "can't tell from film"

const t = (label: string): Tool => ({ key: label.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, ""), label });
const TOOLS: [RegExp, (pos: string) => Tool[]][] = [
  [/baseball|softball/i, (pos) => /\b(p|rhp|lhp|pitch)/i.test(pos)
    ? ["Velocity", "Command", "Off-speed", "Mechanics", "Competitiveness"].map(t)
    : ["Hit", "Power", "Run", "Arm", "Field"].map(t)],
  [/basketball/i, () => ["Shooting", "Ball handling", "Passing / vision", "Defense", "Athleticism", "Basketball IQ"].map(t)],
  [/football/i, () => ["Speed", "Strength", "Agility", "Technique", "Football IQ", "Size / frame"].map(t)],
  [/soccer/i, () => ["First touch", "Passing", "Pace", "Defending", "Vision / IQ", "Fitness"].map(t)],
  [/volleyball/i, () => ["Attacking", "Passing", "Serving", "Blocking / defense", "Vertical", "Court IQ"].map(t)],
  [/lacrosse/i, () => ["Stick skills", "Shooting", "Dodging", "Defense", "Speed", "Lacrosse IQ"].map(t)],
];
const GENERIC_TOOLS = ["Athleticism", "Skill / technique", "Speed", "Strength", "Sport IQ", "Competitiveness"].map(t);

export function toolsFor(sport: string, position: string): Tool[] {
  return TOOLS.find(([re]) => re.test(sport))?.[1](position) ?? GENERIC_TOOLS;
}

/** 1–10 → words families understand. */
export function grade(v: number): string {
  return v >= 10 ? "Elite" : v >= 8 ? "Strong" : v >= 6 ? "Good" : v >= 4 ? "Average" : "Developing";
}

/**
 * Validate a report card from the answer page: every tool for this sport/position must be rated 1–10
 * or marked "can't tell" (null); at least half must have a real number.
 */
export function cleanReport(raw: unknown, sport: string, position: string): { lines: ReportLine[]; complete: boolean } {
  const tools = toolsFor(sport, position);
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const lines: ReportLine[] = [];
  let answered = 0, rated = 0;
  for (const tl of tools) {
    if (!(tl.key in src)) { lines.push({ ...tl, value: null }); continue; }
    answered++;
    const v = src[tl.key] === null ? null : Number(src[tl.key]);
    if (v !== null && Number.isInteger(v) && v >= 1 && v <= 10) { lines.push({ ...tl, value: v }); rated++; }
    else lines.push({ ...tl, value: null });
  }
  return { lines, complete: answered === tools.length && rated * 2 >= tools.length };
}

type Phrases = { liked: string[]; work: string[] };
const GENERIC: Phrases = {
  liked: ["Competes hard every rep", "Good athlete for the position", "Coachable body language", "Plays fast", "Good size for the position"],
  work: ["Get stronger in the weight room", "Show more game film", "Add speed and explosiveness", "Be more consistent rep to rep", "Keep grades up"],
};
const BY_SPORT: [RegExp, Phrases][] = [
  [/baseball|softball/i, {
    liked: ["Quick hands at the plate", "Strong arm", "Good glove work", "Gets off the ball fast", "Smooth swing path", "Good feel for the zone"],
    work: ["Footwork on throws", "Add bat speed", "Get stronger in the lower half", "Show more game at-bats on film", "Improve first-step quickness", "Consistency throwing across the diamond"],
  }],
  [/basketball/i, {
    liked: ["Quick first step", "Good feel as a passer", "Shoots it well off the catch", "Plays hard on defense", "Good size and length", "Finishes through contact"],
    work: ["Off-hand finishing", "Consistency on the jumper", "Add strength", "Defensive positioning", "Ball handling under pressure", "Show more full-game film"],
  }],
  [/football/i, {
    liked: ["Plays fast and physical", "Good hands", "Quick feet", "Strong at the point of attack", "Good instincts", "Explosive off the line"],
    work: ["Add strength and weight", "Pad level", "Change of direction speed", "Technique at the top of routes", "Tackling form", "Show full-game film, not only highlights"],
  }],
  [/soccer/i, {
    liked: ["Comfortable on the ball", "Good vision", "Works hard off the ball", "Strong in the air", "Good first touch", "Quick in tight spaces"],
    work: ["Weaker foot", "Speed of play", "Defensive positioning", "Fitness level", "Decision-making in the final third", "Show more full-match film"],
  }],
  [/volleyball/i, {
    liked: ["Good arm swing", "Strong platform passing", "Quick off the floor", "Good court awareness", "Reads the hitter well", "Good blocking timing"],
    work: ["Approach footwork", "Serve consistency", "Add vertical", "Shot selection", "Transition speed", "Show more match film"],
  }],
];

export function phrasesFor(sport: string): Phrases {
  return BY_SPORT.find(([re]) => re.test(sport))?.[1] ?? GENERIC;
}

/** A season plan for the athlete's grad year (adds value to every answer at no cost to the coach). */
export function gamePlan(gradYear: number, now: Date, level?: string | null): string[] {
  const yearsLeft = gradYear - now.getFullYear() - (now.getMonth() >= 7 ? 1 : 0); // after August, the school year has turned
  const target = level ? `${level} ` : "";
  if (yearsLeft >= 3)
    return [
      "Build the base: strength, speed and skill work this off-season.",
      "Film full games this season. Coaches recruit on full games, not only highlights.",
      `Start a list of 15–20 ${target}programs you'd be excited about.`,
      "Keep grades up. A strong GPA opens more doors than most families realize.",
    ];
  if (yearsLeft === 2)
    return [
      `Narrow your list to 10–15 ${target}programs and learn each staff's recruiting coordinator.`,
      "Pick 2–3 camps at schools on your list this summer and reach out to those coaches beforehand.",
      "Update your film after every season with your best plays in the first minute.",
      "Keep coaches updated every few months with new film, stats and your schedule.",
    ];
  if (yearsLeft === 1)
    return [
      "This is the key year. Follow up with interested programs every 4–6 weeks.",
      "Attend camps at your top schools. That's where many offers and roster spots get decided.",
      "Ask coaches directly where you stand and what they need to see.",
      "Plan official and unofficial visits to the schools that are showing interest.",
    ];
  return [
    `Reach out to ${target}programs that still have roster needs. Many rosters fill late.`,
    "Send current film and your schedule, and ask about open roster spots.",
    "Consider JUCO and NAIA programs too. Many players move up from there.",
    "Respond quickly when a coach reaches out. Late in the process, speed matters.",
  ];
}

/** A short thank-you the athlete can send back (helps them stand out). */
export function thankYouNote(a: { athleteFirst: string; coachLast: string; kind: string | null; detail?: string | null }): string {
  const what = a.kind === "camp" ? `the camp invite${a.detail ? ` to ${a.detail}` : ""}` : a.kind === "event" ? "letting me know where your staff will be" : "taking the time to look at my film";
  return `Coach ${a.coachLast}, thank you for ${what} and for the feedback. I'm working on it and I'll keep you updated with new film. — ${a.athleteFirst}`;
}
