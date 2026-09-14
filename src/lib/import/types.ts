/**
 * Parser output — the in-memory shape produced from a Spectora HTML-text export
 * BEFORE anything is written to the database. Keeping this separate from the DB
 * types lets the fidelity check compare "what we parsed" against "what we stored".
 */

import type { IssueKind, IssueSeverity } from "@/lib/types";

export type ExtraValue = string | number | boolean | null;

export interface ParsedComment {
  /** Cleaned (entity-decoded, trimmed). Null when the source cell is empty. */
  name: string | null;
  /** Verbatim source name when it differs from `name` (entities, padding). */
  rawName: string | null;
  /** Verbatim Comment Text when it contains markup; null for plain-text comments. */
  bodyHtml: string | null;
  /** Plain text: entity-decoded, tags stripped. Null when the source cell is empty. */
  bodyText: string | null;
  commentType: string | null;
  category: string | null;
  recommendation: string | null;
  /** 1-based row number in the source sheet, for issue reporting and round-trip checks. */
  sourceRow: number;
  /** All other columns, verbatim, keyed by their original header text. Empty cells are omitted. */
  extra: Record<string, ExtraValue>;
}

export interface ParsedItem {
  name: string;
  rawName: string | null;
  sourceRow: number;
  comments: ParsedComment[];
}

export interface ParsedSection {
  name: string;
  rawName: string | null;
  sourceRow: number;
  items: ParsedItem[];
}

export interface ParsedIssue {
  severity: IssueSeverity;
  kind: IssueKind;
  rowNumber: number | null;
  location: string | null;
  message: string;
  rawValue: string | null;
}

export interface ParsedTemplate {
  /** Name inferred from the file name, overridable by the user. */
  suggestedName: string;
  sections: ParsedSection[];
  issues: ParsedIssue[];
  stats: {
    rowsTotal: number;
    rowsBlank: number;
    sections: number;
    items: number;
    comments: number;
    commentsWithHtml: number;
    commentsWithoutText: number;
  };
  /** Headers present in the file, in order, verbatim. */
  columnsSeen: string[];
  /** Headers this importer mapped to first-class fields. Everything else goes to `extra` + an issue. */
  columnsMapped: string[];
}

/** Thrown when the file cannot be imported at all. Recorded as a rejected import_run. */
export class ImportRejectedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(reason);
    this.name = "ImportRejectedError";
  }
}
