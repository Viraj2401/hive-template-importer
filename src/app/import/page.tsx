import { ImportForm } from "@/components/import-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import a template</h1>
        <p className="text-sm text-muted-foreground">
          Upload a Spectora HTML-text export. Text, hierarchy and order are preserved; anything the importer
          cannot model is kept verbatim and listed, never dropped.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spectora export</CardTitle>
          <CardDescription>.xls or .xlsx from “Export to spreadsheet → Export HTML Text”.</CardDescription>
        </CardHeader>
        <CardContent>
          <ImportForm />
        </CardContent>
      </Card>
    </div>
  );
}
