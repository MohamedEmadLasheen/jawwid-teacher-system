import { supabase } from '@/lib/supabase';
import type { BrandingSettings } from '@/store/brandingStore';

const DEFAULT: BrandingSettings = {
  logoDataUrl: '',
  nameAr: 'أكاديمية جوِّد',
  nameEn: 'Jawwid Academy',
  tagline: 'منصة إدارة المعلمين والإشراف والجودة',
  email: '',
  phone: '',
  whatsapp: '',
  website: '',
  address: '',
};

export async function fetchBranding(): Promise<BrandingSettings> {
  const { data, error } = await supabase
    .from('branding_settings')
    .select('*')
    .eq('id', 1)
    .single();
  if (error || !data) return DEFAULT;
  return {
    logoDataUrl: data.logo_data_url ?? '',
    nameAr: data.name_ar,
    nameEn: data.name_en,
    tagline: data.tagline,
    email: data.email ?? '',
    phone: data.phone ?? '',
    whatsapp: data.whatsapp ?? '',
    website: data.website ?? '',
    address: data.address ?? '',
  };
}

export async function updateBranding(updates: Partial<BrandingSettings>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (updates.logoDataUrl !== undefined) patch.logo_data_url = updates.logoDataUrl;
  if (updates.nameAr !== undefined) patch.name_ar = updates.nameAr;
  if (updates.nameEn !== undefined) patch.name_en = updates.nameEn;
  if (updates.tagline !== undefined) patch.tagline = updates.tagline;
  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.whatsapp !== undefined) patch.whatsapp = updates.whatsapp;
  if (updates.website !== undefined) patch.website = updates.website;
  if (updates.address !== undefined) patch.address = updates.address;

  const { error } = await supabase
    .from('branding_settings')
    .update(patch)
    .eq('id', 1);
  if (error) throw error;
}
