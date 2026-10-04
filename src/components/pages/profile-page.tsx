"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { ErrorMessage, LoadingModal, PageHeader } from "@/components/ui";

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  if (!user) return null;

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSaved(false);
    setError("");
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    
    const body = new FormData(event.currentTarget);
    const avatar = body.get("avatar");
    
    if (avatar instanceof File && avatar.size === 0) {
      body.delete("avatar");
    }
    
    try {
      setSaving(true);
      await api("/auth/me/", { method: "PATCH", body });
      await refresh();
      setPreview(null);
      setSaved(true);
    } catch (x) {
      setError(x instanceof Error ? x.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  const avatarUrl = preview || user.avatar;

  return (
    <div className="space-y-6">
      <LoadingModal open={saving} title="Saving profile" message="Updating your profile information." />
      <PageHeader 
        title="Profile Management" 
        description="Manage personal details and your profile image." 
      />
      
      <form onSubmit={save} className="panel p-6 max-w-2xl space-y-6" encType="multipart/form-data">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 pb-6 border-b border-[var(--border)]">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={`${user.name} avatar`} 
              className="h-24 w-24 rounded-full object-cover border border-[var(--border)] shadow-sm" 
            />
          ) : (
            <div className="h-24 w-24 rounded-full bg-[var(--primary)] text-white grid place-items-center text-3xl font-bold shadow-sm">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          
          <label className="space-y-2 flex-1">
            <span className="font-semibold block text-sm">Upload Avatar</span>
            <input 
              className="field" 
              name="avatar" 
              type="file" 
              accept="image/jpeg,image/png,image/webp,image/gif" 
              onChange={selectAvatar} 
            />
            <span className="block text-xs muted">
              JPEG, PNG, WebP, or GIF. Maximum 5 MB by default.
            </span>
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="font-semibold text-sm">First Name</span>
            <input className="field" name="first_name" defaultValue={user.first_name} placeholder="First name" />
          </label>
          <label className="block space-y-1">
            <span className="font-semibold text-sm">Last Name</span>
            <input className="field" name="last_name" defaultValue={user.last_name} placeholder="Last name" />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="font-semibold text-sm">Email Address</span>
          <input className="field opacity-60 cursor-not-allowed" value={user.email} disabled />
        </label>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="font-semibold text-sm">Department</span>
            <input className="field" name="department" defaultValue={user.department} placeholder="Department" />
          </label>
          <label className="block space-y-1">
            <span className="font-semibold text-sm">Phone Number</span>
            <input className="field" name="phone" defaultValue={user.phone} placeholder="Phone" />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="font-semibold text-sm">Bio</span>
          <textarea className="field" name="bio" defaultValue={user.bio} placeholder="Tell us a little about yourself" rows={4} />
        </label>

        {error && <ErrorMessage message={error} />} 
        
        {saved && (
          <div className="p-3 bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] border border-[color-mix(in_srgb,var(--primary)_40%,transparent)] rounded-lg text-[var(--primary-dark)] dark:text-[var(--primary)] text-sm font-semibold flex items-center gap-2">
            <span>✓</span> Profile saved successfully.
          </div>
        )}

        <div className="pt-2">
          <button className="btn btn-primary w-full sm:w-auto px-8" disabled={saving}>{saving ? "Saving..." : "Save Profile"}</button>
        </div>
      </form>
    </div>
  );
}
