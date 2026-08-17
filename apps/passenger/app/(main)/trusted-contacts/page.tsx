"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, Trash2, UserPlus, Users } from "lucide-react";
import { BottomSheet, Button, Card, EmptyState, Input, SkeletonRow } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { listTrustedContacts, addTrustedContact, removeTrustedContact, type TrustedContactRow } from "@ride-it/data";

export default function TrustedContactsPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [contacts, setContacts] = React.useState<TrustedContactRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [relationship, setRelationship] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!user) return;
    setContacts(await listTrustedContacts(supabase, user.id));
  }, [supabase, user]);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function handleAdd() {
    if (!user || !name.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      await addTrustedContact(supabase, user.id, {
        name: name.trim(),
        phone: phone.trim(),
        relationshipLabel: relationship.trim() || undefined,
      });
      setName("");
      setPhone("");
      setRelationship("");
      setSheetOpen(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    await removeTrustedContact(supabase, id);
    await refresh();
  }

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/profile" aria-label="Back" className="-m-2.5 p-2.5 text-ink-soft">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="font-display text-2xl font-medium text-ink">Trusted Contacts</h1>
        </div>
        <button onClick={() => setSheetOpen(true)} aria-label="Add trusted contact" className="-m-2.5 p-2.5 text-signal-blue">
          <UserPlus size={22} />
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        People you can share an active ride with, and who Ride It may notify context about during an SOS.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {loading && Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && contacts.length === 0 && (
          <EmptyState
            icon={<Users size={20} />}
            title="No trusted contacts yet"
            description="Add someone you'd want to share a ride with or reach in an emergency."
          />
        )}

        {!loading &&
          contacts.map((c) => (
            <Card key={c.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">{c.name}</p>
                <p className="text-xs text-ink-soft">
                  +91 {c.phone}
                  {c.relationship_label ? ` · ${c.relationship_label}` : ""}
                </p>
              </div>
              <button onClick={() => handleRemove(c.id)} aria-label={`Remove ${c.name}`} className="-m-2.5 p-2.5 text-alert-red">
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
      </div>

      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <p className="text-sm font-medium text-ink">Add trusted contact</p>
        <div className="mt-3 flex flex-col gap-3">
          <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input
            size="sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            placeholder="Phone number"
            inputMode="numeric"
          />
          <Input
            size="sm"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Relationship (optional) — e.g. Parent, Spouse"
          />
          <Button disabled={!name.trim() || phone.trim().length < 10 || saving} onClick={handleAdd}>
            {saving ? "Saving…" : "Add contact"}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}
