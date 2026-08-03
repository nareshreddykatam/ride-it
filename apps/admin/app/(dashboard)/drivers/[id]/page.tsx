"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, StatusPill } from "@ride-it/ui";

const DOCUMENTS = [
  { key: "aadhaar", label: "Aadhaar Card" },
  { key: "drivingLicense", label: "Driving License" },
  { key: "rc", label: "Vehicle RC" },
  { key: "insurance", label: "Insurance" },
  { key: "selfie", label: "Selfie Verification" },
] as const;

export default function DriverDetailPage({ params }: { params: { id: string } }) {
  const [docStatus, setDocStatus] = React.useState<Record<string, "PENDING" | "APPROVED" | "REJECTED">>(
    Object.fromEntries(DOCUMENTS.map((d) => [d.key, "PENDING"]))
  );

  function setStatus(key: string, status: "APPROVED" | "REJECTED") {
    setDocStatus((prev) => ({ ...prev, [key]: status }));
  }

  const allApproved = DOCUMENTS.every((d) => docStatus[d.key] === "APPROVED");

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Ramesh K.</h1>
          <p className="mt-1 text-sm text-ink-soft">Driver ID: {params.id} · Auto · 98765 43210</p>
        </div>
        <StatusPill tone={allApproved ? "online" : "pending"}>
          {allApproved ? "Approved" : "Pending review"}
        </StatusPill>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {DOCUMENTS.map((doc) => (
          <Card key={doc.key}>
            <CardHeader>
              <CardTitle className="text-sm">{doc.label}</CardTitle>
              <StatusPill
                tone={
                  docStatus[doc.key] === "APPROVED"
                    ? "online"
                    : docStatus[doc.key] === "REJECTED"
                      ? "alert"
                      : "pending"
                }
              >
                {docStatus[doc.key]}
              </StatusPill>
            </CardHeader>
            <div className="flex h-28 items-center justify-center rounded-lg bg-ink/5 text-xs text-ink-soft">
              Document preview — file storage integration pending
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatus(doc.key, "REJECTED")}>
                Reject
              </Button>
              <Button size="sm" className="flex-1" onClick={() => setStatus(doc.key, "APPROVED")}>
                Approve
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex gap-3">
        <Button variant="destructive">Suspend driver</Button>
      </div>
    </div>
  );
}
