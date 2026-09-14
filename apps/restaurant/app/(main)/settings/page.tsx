"use client";

import * as React from "react";
import { Card, Input, Button, PageLoader } from "@ride-it/ui";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import { getPublicUrl } from "@ride-it/supabase/storage";
import { updateRestaurant, uploadRestaurantLogo, uploadRestaurantCover, submitRestaurantVerification } from "@ride-it/data";
import { useRestaurant } from "../../../components/restaurant-context";

export default function SettingsPage() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const { current, loading, refresh } = useRestaurant();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [businessLicense, setBusinessLicense] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const [uploadingCover, setUploadingCover] = React.useState(false);

  React.useEffect(() => {
    if (!current) return;
    setName(current.name);
    setAddress(current.address);
  }, [current]);

  async function handleSave() {
    if (!current) return;
    setSaving(true);
    try {
      await updateRestaurant(supabase, current.id, { name, address, phone: phone || undefined, email: email || undefined });
      await submitRestaurantVerification(supabase, current.id, { businessLicenseNumber: businessLicense || undefined });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    if (!current) return;
    setUploadingLogo(true);
    try {
      await uploadRestaurantLogo(supabase, current.id, file);
      refresh();
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleCoverUpload(file: File) {
    if (!current) return;
    setUploadingCover(true);
    try {
      await uploadRestaurantCover(supabase, current.id, file);
      refresh();
    } finally {
      setUploadingCover(false);
    }
  }

  if (loading || !current) return <PageLoader />;

  const logoUrl = current.logoPath ? getPublicUrl(supabase, "restaurant-images", current.logoPath) : null;
  const coverUrl = current.coverImagePath ? getPublicUrl(supabase, "restaurant-images", current.coverImagePath) : null;

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>

      <Card className="mt-6 max-w-xl">
        <p className="text-sm font-semibold text-ink">Restaurant images</p>
        <div className="mt-3 flex gap-4">
          <div>
            <p className="mb-1 text-xs text-ink-soft">Logo</p>
            <div className="h-20 w-20 overflow-hidden rounded-lg bg-tint-blue">
              {logoUrl && <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />}
            </div>
            <input
              type="file"
              accept="image/*"
              disabled={uploadingLogo}
              onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
              className="mt-1 text-xs text-ink-soft"
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-soft">Cover image</p>
            <div className="h-20 w-32 overflow-hidden rounded-lg bg-tint-blue">
              {coverUrl && <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />}
            </div>
            <input
              type="file"
              accept="image/*"
              disabled={uploadingCover}
              onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])}
              className="mt-1 text-xs text-ink-soft"
            />
          </div>
        </div>
      </Card>

      <Card className="mt-4 max-w-xl">
        <p className="text-sm font-semibold text-ink">Restaurant details</p>
        <div className="mt-3 flex flex-col gap-3">
          <Input label="Restaurant name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={current.address} />
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Input
            label="Business license number (optional)"
            value={businessLicense}
            onChange={(e) => setBusinessLicense(e.target.value)}
            hint="Used for verification review — additional documents may be requested by Admin."
          />
          <Button className="mt-2" loading={saving} onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </Card>
    </main>
  );
}
