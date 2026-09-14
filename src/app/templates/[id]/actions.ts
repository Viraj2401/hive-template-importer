"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as m from "@/lib/db/mutations";

type Result = { ok: true } | { ok: false; error: string };

function wrap(fn: () => Promise<void>): Promise<Result> {
  return fn()
    .then(() => ({ ok: true }) as const)
    .catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }) as const);
}

export async function renameTemplateAction(templateId: string, name: string): Promise<Result> {
  const r = await wrap(() => m.renameTemplate(templateId, name));
  if (r.ok) {
    revalidatePath(`/templates/${templateId}`);
    revalidatePath("/");
  }
  return r;
}

export async function renameSectionAction(templateId: string, sectionId: string, name: string): Promise<Result> {
  const r = await wrap(() => m.renameSection(sectionId, name));
  if (r.ok) revalidatePath(`/templates/${templateId}`);
  return r;
}

export async function renameItemAction(templateId: string, itemId: string, name: string): Promise<Result> {
  const r = await wrap(() => m.renameItem(itemId, name));
  if (r.ok) revalidatePath(`/templates/${templateId}`);
  return r;
}

export async function updateCommentAction(
  templateId: string,
  commentId: string,
  input: { name: string; body: string },
): Promise<Result> {
  const r = await wrap(() => m.updateComment(commentId, input));
  if (r.ok) revalidatePath(`/templates/${templateId}`);
  return r;
}

export async function recheckFidelityAction(templateId: string): Promise<Result> {
  const r = await wrap(async () => {
    await m.recheckFidelity(templateId);
  });
  if (r.ok) revalidatePath(`/templates/${templateId}`);
  return r;
}

export async function copyTemplateAction(templateId: string): Promise<never> {
  const newId = await m.copyTemplate(templateId);
  revalidatePath("/");
  redirect(`/templates/${newId}`);
}

export async function deleteTemplateAction(templateId: string): Promise<never> {
  await m.deleteTemplate(templateId);
  revalidatePath("/");
  redirect("/");
}
