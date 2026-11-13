import type { Coach } from "./types";
import type { MemoryStore } from "./store-memory";

/**
 * Entirely fictional people and schools, used only in DEMO_MODE and local development.
 * Never present real coaches as participating without their verified agreement.
 */
type Seed = Partial<Coach> & Pick<Coach, "slug" | "full_name" | "sport">;
const approved = {
  listing_type: "participating" as const,
  verification_status: "verified" as const,
  eligibility_status: "approved" as const,
  is_demo: true,
  source: "self" as const,
  email_confirmed_at: "2026-10-01T00:00:00Z",
};

export const DEMO_COACHES: Seed[] = [
  {
    ...approved, slug: "jordan-ellis", full_name: "Jordan Ellis", title: "Former Head Coach", school: "Lakeshore State (former)",
    sport: "Basketball (M)", division: "NCAA D2", conference: "Great Plains Athletic", state: "OH",
    email: "jordan.ellis@example.com", coach_kind: "former_college", price_cents: 5000,
    eligibility_basis: "Former D2 head coach; no current institutional employment (verified 2026-10).",
    credentials: "14 seasons as a college coach · 2× conference coach of the year",
    bio: "I spent 14 years recruiting guards and wings. I'll tell you exactly what a college staff sees in your first 60 seconds of film — and what to fix.",
  },
  {
    ...approved, slug: "maya-okafor", full_name: "Maya Okafor", title: "Independent Evaluator", school: "Former Pine Valley University",
    sport: "Soccer (W)", division: "NCAA D1", conference: "Atlantic Coast Demo", state: "NC",
    email: "maya.okafor@example.com", coach_kind: "former_college", price_cents: 5000,
    eligibility_basis: "Former D1 assistant; now independent club director. Not employed by any college.",
    credentials: "Former D1 assistant · 9 years · USSF A License",
    bio: "Center-backs, holding mids, keepers: I'll break down positioning, first touch and decision speed on your highlight reel.",
  },
  {
    ...approved, slug: "derek-hampton", full_name: "Derek Hampton", title: "Recruiting Consultant", school: "Former Red Mesa College",
    sport: "Football", division: "NJCAA", conference: "Western States Demo", state: "AZ",
    email: "derek.hampton@example.com", coach_kind: "independent", price_cents: 5000,
    eligibility_basis: "Independent evaluator; former JUCO coordinator, no current college role.",
    credentials: "Former JUCO defensive coordinator · 60+ players sent to 4-year programs",
    bio: "Linebackers and DBs. Honest feedback on speed, pursuit angles and what your film is missing.",
  },
  {
    ...approved, slug: "sofia-reyes", full_name: "Sofia Reyes", title: "Former Assistant Coach", school: "Former Harbor City College",
    sport: "Volleyball (W)", division: "NAIA", conference: "Pacific Demo", state: "CA",
    email: "sofia.reyes@example.com", coach_kind: "former_college", price_cents: 5000,
    eligibility_basis: "Former NAIA assistant; currently a high-school teacher with no college affiliation.",
    credentials: "Former NAIA assistant · Club 17s director",
    bio: "Setters and outsides. I'll talk you through your approach, arm swing and how your video reads to a staff.",
  },
  {
    ...approved, slug: "chris-nakamura", full_name: "Chris Nakamura", title: "Pitching Instructor", school: "Former Summit Valley",
    sport: "Baseball", division: "CCCAA", conference: "Coast Demo", state: "CA",
    email: "chris.nakamura@example.com", coach_kind: "independent", price_cents: 5000,
    eligibility_basis: "Independent pitching instructor; former CCCAA pitching coach.",
    credentials: "Former CCCAA pitching coach · Driveline-certified",
    bio: "Pitchers only. Mechanics, tempo, and what a radar reading on your video should look like.",
  },
  {
    ...approved, slug: "tre-williams", full_name: "Tre Williams", title: "Former Assistant Coach", school: "Former Bayview College",
    sport: "Basketball (M)", division: "NAIA", conference: "Sun Demo", state: "FL",
    email: "tre.williams@example.com", coach_kind: "former_college", price_cents: 5000,
    eligibility_basis: "Former NAIA assistant; now a skills trainer with no college affiliation.",
    credentials: "Former NAIA assistant · 8 years · skills trainer",
    bio: "Guards and wings. Ball-handling, shot prep and what your reel needs in the first 30 seconds.",
  },
  {
    ...approved, slug: "cam-delgado", full_name: "Cam Delgado", title: "Outfielder", school: "Coastal Demo Pros (pro baseball)",
    sport: "Baseball", division: "Professional", conference: null, state: "GA",
    email: "cam.delgado@example.com", coach_kind: "pro_player", price_cents: 5000,
    eligibility_basis: "Verified pro player; self-attested contract allows paid evaluations.",
    credentials: "Professional outfielder · 4 seasons · former D1 player",
    bio: "Outfield and hitting. I'll tell you what pro and college scouts notice first on your swing and jumps.",
  },
  // Directory-only listings (not participating) — demonstrate the honest "not on the platform" state.
  { slug: "demo-directory-1", email: "alex.turner@example.edu", full_name: "Alex Turner", title: "Head Coach", school: "Northfield Demo University", sport: "Basketball (W)", division: "NCAA D1", conference: "Midwest Demo", state: "IL", coach_kind: "active_college", is_demo: true },
  { slug: "demo-directory-2", email: "priya.shah@example.edu", full_name: "Priya Shah", title: "Assistant Coach", school: "Eastbrook Demo College", sport: "Soccer (M)", division: "NCAA D3", conference: "New England Demo", state: "MA", coach_kind: "active_college", is_demo: true },
  { slug: "demo-directory-3", email: "marcus.webb@example.edu", full_name: "Marcus Webb", title: "Recruiting Coordinator", school: "Gulf Coast Demo CC", sport: "Football", division: "NJCAA", conference: "Gulf Demo", state: "TX", coach_kind: "active_college", is_demo: true },
  { slug: "demo-directory-4", email: "hannah.brooks@example.edu", full_name: "Hannah Brooks", title: "Head Coach", school: "Cedar Ridge Demo University", sport: "Softball", division: "NCAA D2", conference: "Peach Demo", state: "GA", coach_kind: "active_college", is_demo: true },
  { slug: "demo-directory-5", email: "luis.moreno@example.edu", full_name: "Luis Moreno", title: "Assistant Coach", school: "Riverbend Demo College", sport: "Baseball", division: "NAIA", conference: "Heartland Demo", state: "KS", coach_kind: "active_college", is_demo: true },
];

export async function seedDemo(store: MemoryStore) {
  for (const c of DEMO_COACHES) await store.insertCoach(c);
}
