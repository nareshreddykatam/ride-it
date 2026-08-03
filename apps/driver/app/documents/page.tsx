import Link from "next/link";
import { Button, Card, CardHeader, CardTitle, StatusPill } from "@ride-it/ui";

const REQUIRED_DOCUMENTS = [
  { key: "aadhaar", label: "Aadhaar Card" },
  { key: "drivingLicense", label: "Driving License" },
  { key: "rc", label: "Vehicle RC" },
  { key: "insurance", label: "Insurance" },
  { key: "selfie", label: "Selfie Verification" },
] as const;

export default function DocumentsPage() {
  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <h1 className="font-display text-2xl font-medium text-ink">Verify your documents</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Upload all 5 documents to get approved and start accepting rides.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {REQUIRED_DOCUMENTS.map((doc) => (
          <Card key={doc.key} className="flex items-center justify-between p-4">
            <CardHeader className="m-0">
              <CardTitle className="text-sm">{doc.label}</CardTitle>
            </CardHeader>
            <StatusPill tone="pending">Not uploaded</StatusPill>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        Document capture (camera/file upload) is a later build pass — this
        demo link simulates admin approval so the Subscription and Dashboard
        screens are reachable end to end.
      </p>

      <div className="mt-auto pt-8">
        <Link href="/subscription">
          <Button className="w-full">Continue (demo: documents approved)</Button>
        </Link>
      </div>
    </main>
  );
}
