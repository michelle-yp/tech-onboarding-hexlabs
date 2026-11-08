import { ObjectId } from "mongodb";
import { collections, type Assignment } from "./db.js";

export type AssignResult =
  | { kind: "assigned"; assignment: Assignment }
  | { kind: "judge-busy" } // the judge already holds a QUEUED assignment
  | { kind: "none-available" }; // no project is eligible for this judge right now

/**
 * TODO: implement. See the README for the rules.
 *
 * `judgeId` is already validated to exist by the route. Use `collections()` from ./db.js.
 * Add any helpers you need.
 */
export async function assignNext(judgeId: string): Promise<AssignResult> {
  const { projects, assignments } = collections();

  // Rule 4: one active project per judge
  if (await assignments.findOne({ judgeId, status: "QUEUED" })) return { kind: "judge-busy" };

  // Rules 1 + 2: skip projects this judge has had, and projects someone is judging now
  const seen = await assignments.distinct("projectId", { judgeId });
  const queued = await assignments.distinct("projectId", { status: "QUEUED" });
  const available = await projects.find({ _id: { $nin: [...seen, ...queued] } }).toArray();
  if (available.length === 0) return { kind: "none-available" }; // Rule 5

  // Rule 3: fewest COMPLETED, random tie-break
  const counts = new Map<string, number>();
  for (const p of available) {
    counts.set(p._id, await assignments.countDocuments({ projectId: p._id, status: "COMPLETED" }));
  }
  const fewest = Math.min(...counts.values());
  const best = available.filter((p) => counts.get(p._id) === fewest);
  const projectId = best[Math.floor(Math.random() * best.length)]._id;

  const assignment: Assignment = { _id: new ObjectId(), judgeId, projectId, status: "QUEUED", createdAt: new Date() };
  await assignments.insertOne(assignment);
  return { kind: "assigned", assignment };
}
