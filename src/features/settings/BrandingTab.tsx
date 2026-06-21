import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, CheckCircle2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AcademyLogo } from '@/components/ui/AcademyLogo';
import { useBrandingStore } from '@/store/brandingStore';
import { useLogStore } from '@/store/logStore';
import { useAuthStore } from '@/store/authStore';

/** Update the browser favicon dynamically */
function updateFavicon(src: string) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = src;
}

export function BrandingTab() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { branding, updateBranding } = useBrandingStore();
  const { addLog } = useLogStore();
  const { currentUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ ...branding });
  const [saved, setSaved] = useState(false);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert(isAr ? 'حجم الصورة يجب أن يكون أقل من 2 ميجابايت' : 'Image must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setForm((f) => ({ ...f, logoDataUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setForm((f) => ({ ...f, logoDataUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateBranding(form);
    // Update browser favicon dynamically
    const faviconSrc = form.logoDataUrl || 'https://mgx-backend-cdn.metadl.com/generate/images/936477/2026-06-18/qyqi73yaaieq/jawwid-logo_variant_1.png';
    updateFavicon(faviconSrc);
    // Update document title
    document.title = `${isAr ? form.nameAr : form.nameEn} — ${form.tagline}`;
    if (currentUser) {
      addLog({
        userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role,
        action: 'system_setting_changed', target: 'Academy Branding',
        details: isAr ? 'تم تحديث هوية الأكاديمية' : 'Academy branding updated',
        tableName: 'settings',
      });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // Preview logo source
  const previewSrc = form.logoDataUrl || 'https://mgx-backend-cdn.metadl.com/generate/images/936477/2026-06-18/qyqkfjqaaiga/jawwid-logo_variant_2.png';

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      {saved && (
        <Alert className="border-green-400 bg-green-50">
          <AlertDescription className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            {isAr ? 'تم حفظ إعدادات الهوية بنجاح' : 'Branding settings saved successfully'}
          </AlertDescription>
        </Alert>
      )}

      {/* Logo Upload */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-primary flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {isAr ? 'شعار الأكاديمية' : 'Academy Logo'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {/* Preview — always shows real logo */}
            <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 shadow-md">
              <img
                src={previewSrc}
                alt="logo preview"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="border-primary/30 text-primary"
              >
                <Upload className="h-3.5 w-3.5 me-2" />
                {isAr ? 'رفع شعار جديد' : 'Upload New Logo'}
              </Button>
              {form.logoDataUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={removeLogo} className="text-red-500 hover:text-red-700">
                  <X className="h-3.5 w-3.5 me-2" />
                  {isAr ? 'استخدام الشعار الافتراضي' : 'Use Default Logo'}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {isAr ? 'PNG, JPG, WebP, SVG — حد أقصى 2 ميجابايت' : 'PNG, JPG, WebP, SVG — Max 2MB'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Academy Names */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-primary">
            {isAr ? 'اسم الأكاديمية والشعار النصي' : 'Academy Name & Tagline'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{isAr ? 'الاسم بالعربية' : 'Name in Arabic'} *</Label>
            <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} dir="rtl" required />
          </div>
          <div className="space-y-1.5">
            <Label>{isAr ? 'الاسم بالإنجليزية' : 'Name in English'} *</Label>
            <Input value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} dir="ltr" required />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{isAr ? 'الشعار النصي (Tagline)' : 'Tagline'}</Label>
            <Input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-primary">
            {isAr ? 'معلومات التواصل' : 'Contact Information'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{isAr ? 'البريد الإلكتروني الرسمي' : 'Official Email'}</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{isAr ? 'رقم الهاتف' : 'Phone Number'}</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{isAr ? 'رقم واتساب' : 'WhatsApp Number'}</Label>
            <Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{isAr ? 'الموقع الإلكتروني' : 'Website URL'}</Label>
            <Input type="url" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{isAr ? 'العنوان' : 'Address'}</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Live Preview */}
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-primary">
            {isAr ? 'معاينة مباشرة' : 'Live Preview'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Sidebar preview */}
          <div className="flex items-center gap-3 p-3 bg-primary rounded-lg w-fit">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/30 flex-shrink-0">
              <img src={previewSrc} alt="preview" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-white text-sm font-bold">{isAr ? form.nameAr : form.nameEn}</p>
              <p className="text-white/70 text-xs">{form.tagline}</p>
            </div>
          </div>
          {/* Footer preview */}
          <div className="flex items-center gap-2 p-2 bg-white border rounded-lg w-fit">
            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
              <img src={previewSrc} alt="preview" className="w-full h-full object-cover" />
            </div>
            <p className="text-xs font-medium text-primary">{isAr ? form.nameAr : form.nameEn}</p>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
        <CheckCircle2 className="h-4 w-4 me-2" />
        {isAr ? 'حفظ إعدادات الهوية' : 'Save Branding Settings'}
      </Button>
    </form>
  );
}
