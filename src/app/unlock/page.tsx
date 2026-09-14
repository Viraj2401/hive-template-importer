import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">This demo is locked</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post" action="/api/unlock" className="space-y-3">
            <input type="hidden" name="next" value={next} />
            <input
              name="password"
              type="password"
              autoFocus
              placeholder="Demo password"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {error && <p className="text-sm text-red-700">That password is not right.</p>}
            <Button type="submit" size="sm">
              Unlock
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
