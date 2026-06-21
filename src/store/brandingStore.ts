import { create } from 'zustand';
import { fetchBranding, updateBranding } from '../services/branding.service';

export interface BrandingSettings {
  logoDataUrl: string;
  nameAr: string;
  nameEn: string;
  tagline: string;
  email: string;
  phone: string;
  whatsapp: string;
  website: string;
  address: string;
}

const DEFAULT_BRANDING: BrandingSettings = {
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

interface BrandingState {
  branding: BrandingSettings;
  loading: boolean;

  fetchBranding: () => Promise<void>;
  updateBranding: (updates: Partial<BrandingSettings>) => Promise<void>;
  resetBranding: () => Promise<void>;
}

export const useBrandingStore = create<BrandingState>()((set) => ({
  branding: DEFAULT_BRANDING,
  loading: false,

  fetchBranding: async () => {
    set({ loading: true });
    try {
      const branding = await fetchBranding();
      set({ branding, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  updateBranding: async (updates) => {
    // Optimistic update
    set((state) => ({ branding: { ...state.branding, ...updates } }));
    await updateBranding(updates);
  },

  resetBranding: async () => {
    set({ branding: DEFAULT_BRANDING });
    await updateBranding(DEFAULT_BRANDING);
  },
}));
