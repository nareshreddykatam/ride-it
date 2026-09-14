"use client";

import * as React from "react";
import { Button, Input, Card } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getFoodCategoriesForAdmin, createFoodCategory } from "@ride-it/data";

export default function AdminFoodCategoriesPage() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [categories, setCategories] = React.useState<any[]>([]);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(() => {
    getFoodCategoriesForAdmin(supabase).then(setCategories);
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
      await createFoodCategory(supabase, { name: name.trim(), slug, displayOrder: categories.length });
      setName("");
      refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-bold text-ink">Food Categories</h1>
      <p className="mt-1 text-sm text-ink-soft">Cuisine/discovery tags shown to passengers browsing Food (e.g. Biryani, South Indian).</p>

      <Card className="mt-6 max-w-lg">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className="rounded-full border border-border bg-tint-blue/30 px-3 py-1.5 text-sm text-ink">
              {c.name}
            </span>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" size="sm" />
          <Button size="sm" loading={saving} onClick={handleAdd}>
            Add
          </Button>
        </div>
      </Card>
    </main>
  );
}
