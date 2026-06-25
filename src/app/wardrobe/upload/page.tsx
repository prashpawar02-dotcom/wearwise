import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { UploadForm } from "./upload-form";

export default async function UploadPage() {
  await requireUser();
  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Add item" back="/wardrobe" />
      <div className="px-6 pt-6 animate-fade-in">
        <h1 className="font-serif text-2xl font-semibold">Add a clothing item</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Snap or upload a clear photo. You can add tags next.
        </p>
        <div className="mt-6">
          <UploadForm />
        </div>
      </div>
    </main>
  );
}
