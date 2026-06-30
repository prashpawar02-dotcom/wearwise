import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { UploadForm } from "./upload-form";

export default async function UploadPage() {
  await requireUser();
  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Add items" back="/wardrobe" />
      <div className="px-6 pt-6 animate-fade-in">
        <h1 className="ww-display text-3xl text-charcoal">
          Add a <em className="text-plum">clear</em> photo.
        </h1>
        <p className="mt-2 text-sm text-graphite">
          One item per photo works best — pick up to 10 at once and we identify each for you.
        </p>
        <div className="mt-6">
          <UploadForm />
        </div>
      </div>
    </main>
  );
}
