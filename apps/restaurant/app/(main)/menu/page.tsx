"use client";

import * as React from "react";
import { Plus, Trash2, Pencil, ImagePlus } from "lucide-react";
import { Button, Card, Input, Select, Switch, PageLoader, EmptyState, Dialog } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getOwnerMenuCategories,
  createMenuCategory,
  deleteMenuCategory,
  getOwnerMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuItemImage,
  type OwnerMenuCategory,
  type OwnerMenuItem,
} from "@ride-it/data";
import { FoodVegType } from "@ride-it/types";
import { useRestaurant } from "../../../components/restaurant-context";

export default function MenuPage() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const { current, loading: loadingRestaurant } = useRestaurant();
  const [categories, setCategories] = React.useState<OwnerMenuCategory[]>([]);
  const [items, setItems] = React.useState<OwnerMenuItem[]>([]);
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [itemDialogOpen, setItemDialogOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<OwnerMenuItem | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(() => {
    if (!current) return;
    Promise.all([getOwnerMenuCategories(supabase, current.id), getOwnerMenuItems(supabase, current.id)]).then(([cats, its]) => {
      setCategories(cats);
      setItems(its);
      setLoading(false);
    });
  }, [supabase, current]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAddCategory() {
    if (!current || !newCategoryName.trim()) return;
    await createMenuCategory(supabase, current.id, newCategoryName.trim(), categories.length);
    setNewCategoryName("");
    refresh();
  }

  async function handleDeleteCategory(id: string) {
    await deleteMenuCategory(supabase, id);
    refresh();
  }

  if (loadingRestaurant || loading) return <PageLoader />;
  if (!current) return <EmptyState title="No restaurant found" />;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Menu</h1>
        <Button onClick={() => { setEditingItem(null); setItemDialogOpen(true); }}>
          <Plus size={16} /> Add item
        </Button>
      </div>

      <Card className="mt-6">
        <p className="text-sm font-semibold text-ink">Menu categories</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <span key={cat.id} className="flex items-center gap-1.5 rounded-full border border-border bg-tint-blue/30 px-3 py-1.5 text-sm text-ink">
              {cat.name}
              <button onClick={() => handleDeleteCategory(cat.id)} aria-label={`Remove ${cat.name}`}>
                <Trash2 size={13} className="text-ink-soft hover:text-alert-red" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="e.g. Starters, Biryani, Drinks" size="sm" />
          <Button size="sm" variant="outline" onClick={handleAddCategory}>
            Add category
          </Button>
        </div>
      </Card>

      {categories.length === 0 ? (
        <EmptyState className="mt-8" icon={<ImagePlus size={22} />} title="Add a category first" description="Create a menu category (e.g. Starters) before adding items." />
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {categories.map((cat) => (
            <div key={cat.id}>
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">{cat.name}</h2>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {items
                  .filter((i) => i.categoryId === cat.id)
                  .map((item) => (
                    <Card key={item.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                        <p className="mt-0.5 font-meter text-sm text-ink-soft">₹{item.price.toFixed(2)}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-xs text-ink-soft">{item.vegType === FoodVegType.VEG ? "Veg" : "Non-veg"}</span>
                          {!item.isAvailable && <span className="text-xs font-medium text-alert-red-text">Sold out</span>}
                        </div>
                      </div>
                      <button onClick={() => { setEditingItem(item); setItemDialogOpen(true); }} aria-label="Edit item">
                        <Pencil size={15} className="text-ink-soft" />
                      </button>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <MenuItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        restaurantId={current.id}
        categories={categories}
        item={editingItem}
        onSaved={refresh}
      />
    </main>
  );
}

function MenuItemDialog({
  open,
  onOpenChange,
  restaurantId,
  categories,
  item,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  categories: OwnerMenuCategory[];
  item: OwnerMenuItem | null;
  onSaved: () => void;
}) {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [vegType, setVegType] = React.useState<FoodVegType>(FoodVegType.VEG);
  const [isAvailable, setIsAvailable] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [imageFile, setImageFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setDescription(item?.description ?? "");
    setPrice(item ? String(item.price) : "");
    setCategoryId(item?.categoryId ?? categories[0]?.id ?? "");
    setVegType(item?.vegType ?? FoodVegType.VEG);
    setIsAvailable(item?.isAvailable ?? true);
    setImageFile(null);
  }, [open, item, categories]);

  async function handleSave() {
    const priceNumber = Number(price);
    if (!name.trim() || !categoryId || !(priceNumber > 0)) return;
    setSaving(true);
    try {
      let savedItemId = item?.id;
      if (item) {
        await updateMenuItem(supabase, item.id, { name, description, price: priceNumber, categoryId, vegType, isAvailable });
      } else {
        const created = await createMenuItem(supabase, { restaurantId, categoryId, name, description, price: priceNumber, vegType });
        savedItemId = created.id;
      }
      if (imageFile && savedItemId) {
        await uploadMenuItemImage(supabase, restaurantId, savedItemId, imageFile);
      }
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    setSaving(true);
    await deleteMenuItem(supabase, item.id);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <h2 className="font-display text-base font-semibold text-ink">{item ? "Edit item" : "Add menu item"}</h2>
      <div className="mt-4 flex flex-col gap-3">
        <Input label="Item name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label="Price (₹)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" checked={vegType === FoodVegType.VEG} onChange={() => setVegType(FoodVegType.VEG)} /> Veg
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" checked={vegType === FoodVegType.NON_VEG} onChange={() => setVegType(FoodVegType.NON_VEG)} /> Non-veg
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink">Available</span>
          <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Item photo</label>
          <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} className="text-sm text-ink-soft" />
        </div>
      </div>
      <div className="mt-6 flex justify-between gap-2">
        {item ? (
          <Button variant="destructive" onClick={handleDelete} disabled={saving}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
