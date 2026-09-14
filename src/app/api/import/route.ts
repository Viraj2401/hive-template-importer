import { NextResponse } from "next/server";
import { importSpectoraFile } from "@/lib/db/import";
import { ImportRejectedError } from "@/lib/import/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB; the reference export is ~55 KB

/**
 * POST multipart/form-data
 *   file: the Spectora "Export HTML Text" spreadsheet (.xls or .xlsx)
 *   name: optional template name override
 *
 * 201 { templateId, importRunId, stats, issuesCount }
 * 422 { error, details }   - file understood but cannot be imported (recorded as a rejected run)
 * 400 { error }            - bad request (no file, too large)
 * 500 { error }            - persistence failure (template rolled back)
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded. Attach the Spectora export as 'file'." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File is larger than ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 400 });
  }

  const nameField = form.get("name");
  const name = typeof nameField === "string" && nameField.trim() ? nameField.trim() : undefined;
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const result = await importSpectoraFile(bytes, file.name, { name });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ImportRejectedError) {
      return NextResponse.json({ error: e.reason, details: e.details ?? null }, { status: 422 });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[import] persistence failed:", message);
    return NextResponse.json({ error: `Import failed and was rolled back: ${message}` }, { status: 500 });
  }
}
