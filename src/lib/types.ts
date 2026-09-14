/**
 * Domain types mirroring supabase/schema.sql.
 * Hierarchy: Template -> Section -> Item -> Comment.
 */

export type UUID = string;

export interface Template {
  id: UUID;
  name: string;
  source_platform: string;
  source_file_name: string | null;
  source_file_hash: string | null;
  parent_template_id: UUID | null;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: UUID;
  template_id: UUID;
  name: string;
  position: number;
  /** e.g. { raw_name: "Siding, Flashing &amp; Trim" } when the source name was escaped or padded. */
  extra: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: UUID;
  section_id: UUID;
  name: string;
  position: number;
  extra: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: UUID;
  item_id: UUID;
  name: string | null;
  body_html: string | null;
  body_text: string | null;
  comment_type: string | null;
  category: string | null;
  recommendation: string | null;
  position: number;
  /** Every source column the importer did not map to a first-class field, keyed by header. */
  extra: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
}

export type ImportRunStatus = "completed" | "rejected";

export interface ImportRun {
  id: UUID;
  template_id: UUID | null;
  file_name: string | null;
  file_hash: string | null;
  status: ImportRunStatus;
  reject_reason: string | null;
  rows_total: number | null;
  sections_count: number | null;
  items_count: number | null;
  comments_count: number | null;
  issues_count: number | null;
  columns_seen: string[] | null;
  columns_mapped: string[] | null;
  /** 4-column shape of what the parser saw; lets the fidelity check re-run after edits. */
  source_snapshot: import("@/lib/fidelity").Snapshot | null;
  /** { atImport, latest } fidelity reports. */
  fidelity: import("@/lib/fidelity").FidelityRecord | null;
  created_at: string;
}

export type IssueSeverity = "skipped" | "unsupported" | "warning" | "info";

/**
 * missing_in_source      - the export did not contain this information at all
 * unsupported_by_importer- the export contained it, this importer does not model it (stored raw in `extra`)
 * malformed              - present but could not be parsed cleanly (stored raw, best-effort applied)
 * orphan                 - a row with no section/item to attach to (attached to an "Unsectioned" bucket)
 * duplicate              - repeated name at the same level (preserved, position-distinct)
 */
export type IssueKind =
  | "missing_in_source"
  | "unsupported_by_importer"
  | "malformed"
  | "orphan"
  | "duplicate"
  | "other";

export interface ImportIssue {
  id: UUID;
  import_run_id: UUID;
  template_id: UUID | null;
  severity: IssueSeverity;
  kind: IssueKind;
  row_number: number | null;
  location: string | null;
  message: string;
  raw_value: string | null;
  created_at: string;
}

/** Fully hydrated template tree, as loaded for the editor and the fidelity check. */
export interface TemplateTree extends Template {
  sections: Array<
    Section & {
      items: Array<Item & { comments: Comment[] }>;
    }
  >;
}
