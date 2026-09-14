import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { Comment, ImportIssue, ImportRun, Item, Section, Template, TemplateTree } from "@/lib/types";

export async function listTemplates(): Promise<Template[]> {
  const sb = supabaseServer();
  const { data, error } = await sb.from("templates").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Template[];
}

export async function getTemplate(id: string): Promise<Template | null> {
  const sb = supabaseServer();
  const { data, error } = await sb.from("templates").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Template) ?? null;
}

/** Load the whole tree in three queries and assemble in memory, preserving position order. */
export async function getTemplateTree(id: string): Promise<TemplateTree | null> {
  const sb = supabaseServer();
  const tpl = await getTemplate(id);
  if (!tpl) return null;

  const { data: sections, error: sErr } = await sb
    .from("sections")
    .select("*")
    .eq("template_id", id)
    .order("position", { ascending: true });
  if (sErr) throw new Error(sErr.message);
  const sectionIds = (sections ?? []).map((s) => s.id as string);
  if (sectionIds.length === 0) return { ...tpl, sections: [] };

  const { data: items, error: iErr } = await sb
    .from("items")
    .select("*")
    .in("section_id", sectionIds)
    .order("position", { ascending: true });
  if (iErr) throw new Error(iErr.message);
  const itemIds = (items ?? []).map((i) => i.id as string);

  let comments: Comment[] = [];
  if (itemIds.length > 0) {
    // chunk the IN list to stay well under URL length limits
    for (let i = 0; i < itemIds.length; i += 200) {
      const { data: chunk, error: cErr } = await sb
        .from("comments")
        .select("*")
        .in("item_id", itemIds.slice(i, i + 200))
        .order("position", { ascending: true });
      if (cErr) throw new Error(cErr.message);
      comments = comments.concat((chunk ?? []) as Comment[]);
    }
  }

  const commentsByItem = new Map<string, Comment[]>();
  for (const c of comments) {
    const arr = commentsByItem.get(c.item_id) ?? [];
    arr.push(c);
    commentsByItem.set(c.item_id, arr);
  }
  const itemsBySection = new Map<string, Array<Item & { comments: Comment[] }>>();
  for (const it of (items ?? []) as Item[]) {
    const arr = itemsBySection.get(it.section_id) ?? [];
    arr.push({ ...it, comments: (commentsByItem.get(it.id) ?? []).sort((a, b) => a.position - b.position) });
    itemsBySection.set(it.section_id, arr);
  }

  return {
    ...tpl,
    sections: ((sections ?? []) as Section[]).map((s) => ({
      ...s,
      items: (itemsBySection.get(s.id) ?? []).sort((a, b) => a.position - b.position),
    })),
  };
}

export async function getLatestImportRun(templateId: string): Promise<ImportRun | null> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("import_runs")
    .select("*")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ImportRun) ?? null;
}

export async function getImportIssues(templateId: string): Promise<ImportIssue[]> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("import_issues")
    .select("*")
    .eq("template_id", templateId)
    .order("row_number", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportIssue[];
}

/** Rejected imports have no template; list them for the failure-case view. */
export async function listRejectedImports(limit = 20): Promise<ImportRun[]> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("import_runs")
    .select("*")
    .eq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportRun[];
}
