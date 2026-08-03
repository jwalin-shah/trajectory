import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { TrajectoryListing } from "../../listing.js";
import { listingFromFile, safeReadDir, sortListings } from "../listing-shared.js";

/** Antigravity CLI SQLite conversations under its local conversation store. */
export async function listAgyTrajectories(
  root: string | undefined,
): Promise<TrajectoryListing[]> {
  const base = root ?? join(homedir(), ".gemini", "antigravity-cli", "conversations");
  const items: TrajectoryListing[] = [];
  for (const entry of safeReadDir(base)) {
    if (!entry.isFile || !entry.name.endsWith(".db")) continue;
    const path = join(base, entry.name);
    const listing = listingFromFile(basename(entry.name, ".db"), path);
    if (listing) items.push(listing);
  }
  return sortListings(items);
}
