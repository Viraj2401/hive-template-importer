import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared tree writer used by both import and copy. Inserts sections, then
 * items, then comments in dependency order, batching comments in chunks.
 * Caller owns the template row and the rollback decision.
 */
export interface TreeCommentInput {
  name: string | null;
  body_html: string | null;
  body_text: string | null;
  comment_type: string | null;
  category: string | null;
  recommendation: string | null;
  extra: Record<string, unknown>;
}
export interface TreeItemInput {
  name: string;
  extra: Record<string, unknown>;
  comments: TreeCommentInput[];
}
export interface TreeSectionInput {
  name: string;
  extra: Record<string, unknown>;
  items: TreeItemInput[];
}

export async function insertTree(sb: SupabaseClient, templateId: string, sections: TreeSectionInput[]): Promise<void> {
  if (sections.length === 0) return;

  const { data: secRows, error: secErr } = await sb
    .from("sections")
    .insert(sections.map((s, i) => ({ template_id: templateId, name: s.name, position: i, extra: s.extra })))
    .select("id, position");
  if (secErr) throw new Error(`Failed to insert sections: ${secErr.message}`);
  const sectionIdByPos = new Map<number, string>((secRows ?? []).map((r) => [r.position as number, r.id as string]));

  const itemInserts = sections.flatMap((s, si) =>
    s.items.map((it, ii) => ({ section_id: sectionIdByPos.get(si)!, name: it.name, position: ii, extra: it.extra })),
  );
  if (itemInserts.length === 0) return;
  const { data: itemRows, error: itemErr } = await sb.from("items").insert(itemInserts).select("id, section_id, position");
  if (itemErr) throw new Error(`Failed to insert items: ${itemErr.message}`);
  const itemIdByKey = new Map<string, string>((itemRows ?? []).map((r) => [`${r.section_id}:${r.position}`, r.id as string]));

  const commentInserts = sections.flatMap((s, si) =>
    s.items.flatMap((it, ii) => {
      const itemId = itemIdByKey.get(`${sectionIdByPos.get(si)}:${ii}`)!;
      return it.comments.map((c, ci) => ({ item_id: itemId, position: ci, ...c }));
    }),
  );
  for (let i = 0; i < commentInserts.length; i += 500) {
    const { error } = await sb.from("comments").insert(commentInserts.slice(i, i + 500));
    if (error) throw new Error(`Failed to insert comments (batch ${i / 500 + 1}): ${error.message}`);
  }
}
