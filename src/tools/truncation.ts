import { z } from "zod";
import type { Truncation } from "../odata.js";

/** Output schema fields of a capped list. */
export const truncationSchema = {
  hasMore: z.boolean().describe("True when more rows match than were returned. Raise maxRecords or narrow the filter to see them."),
  requestedMax: z.number().optional().describe("The row cap that was applied. Absent when the list is not capped."),
  totalMatching: z.number().optional().describe("How many rows match in all, when Dataverse counted them (it stops counting at 5,000)."),
};

/** The truncation fields of a result, for `structuredContent`. A list without a cap reports `hasMore: false`. */
export function truncationOf(result: Partial<Truncation>): Partial<Truncation> & { hasMore: boolean } {
  return {
    hasMore: result.hasMore === true,
    ...(result.requestedMax !== undefined ? { requestedMax: result.requestedMax } : {}),
    ...(result.totalMatching !== undefined ? { totalMatching: result.totalMatching } : {}),
  };
}

/** A warning to put before the data when the list was cut, so it cannot be read as complete. */
export function truncationContent(result: Partial<Truncation>): { type: "text"; text: string }[] {
  if (!result.hasMore) return [];
  const of = result.totalMatching !== undefined ? ` of ${result.totalMatching} matching` : "";
  return [{
    type: "text",
    text: `Warning: stopped at maxRecords=${result.requestedMax}${of}; more rows exist. Raise maxRecords or narrow the filter to see the rest.`,
  }];
}
