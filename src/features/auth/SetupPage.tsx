import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AcademyLogo } from '@/components/ui/AcademyLogo';
import { useAuthStore } from '@/store/authStore';
import { useBrandingStore } from '@/store/brandingStore';

export function SetupPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigate = useNavigate();
  const { createSuperAdmin } = useAuthStore();
  const { branding } = useBrandingStore();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError(isAr ? 'كلمتا المرور غير متطابقتان' : 'Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError(isAr ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters');
      return;
    }
    if (!form.email.includes('@')) {
      setError(isAr ? 'البريد الإلكتروني غير صحيح' : 'Invalid email address');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await createSuperAdmin(form.name, form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : (isAr ? 'حدث خطأ أثناء إنشاء الحساب' : 'An error occurred while creating the account')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <AcademyLogo size={88} ring className="shadow-2xl border-4 border-white/20" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            {isAr ? branding.nameAr : branding.nameEn}
          </h1>
          <p className="text-white/70 text-sm mt-1">{branding.tagline}</p>
        </div>

        <Card className="shadow-2xl border-0">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-primary text-lg">
              {isAr ? 'إعداد النظام الأولي' : 'Initial System Setup'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? 'أنشئ حساب المشرف العام لبدء استخدام النظام'
                : 'Create the Super Admin account to start using the system'}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700">
                  {isAr
                    ? 'هذا الحساب سيكون المشرف العام للنظام بصلاحيات كاملة.'
                    : 'This account will be the Super Admin with full system privileges.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>{isAr ? 'الاسم الكامل' : 'Full Name'} *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={isAr ? 'اسم المشرف العام' : 'Super Admin name'}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>{isAr ? 'البريد الإلكتروني' : 'Email'} *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>{isAr ? 'كلمة المرور' : 'Password'} *</Label>
                <div className="relative">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); setError(''); }}
                    placeholder={isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}
                    className="pe-10"
                    required
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute inset-y-0 end-3 flex items-center text-muted-foreground">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'} *</Label>
                <Input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => { setForm((f) => ({ ...f, confirm: e.target.value })); setError(''); }}
                  placeholder={isAr ? 'أعد كتابة كلمة المرور' : 'Repeat password'}
                  required
                />
              </div>

              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                disabled={submitting}
              >
                <CheckCircle2 className="h-4 w-4 me-2" />
                {submitting
                  ? (isAr ? 'جارٍ الإنشاء...' : 'Creating...')
                  : (isAr ? 'إنشاء الحساب وبدء النظام' : 'Create Account & Start System')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center flex items-center justify-center gap-2 opacity-60">
          <AcademyLogo size={18} />
          <p className="text-white/70 text-xs">{isAr ? branding.nameAr : branding.nameEn}</p>
        </div>
      </div>
    </div>
  );
}


