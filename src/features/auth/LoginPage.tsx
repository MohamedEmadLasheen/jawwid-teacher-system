import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AcademyLogo } from '@/components/ui/AcademyLogo';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { useBrandingStore } from '@/store/brandingStore';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { addLog } = useLogStore();
  const { branding } = useBrandingStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    localStorage.setItem('jawwid_lang', newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const success = await login(email, password);
      if (success) {
        const { currentUser } = useAuthStore.getState();
        if (currentUser) {
          addLog({
            userId: currentUser.id,
            userName: currentUser.name,
            userRole: currentUser.role,
            action: 'login',
            target: 'النظام',
            details: 'تسجيل دخول ناجح',
            tableName: 'auth',
          });
        }
        navigate('/dashboard');
      } else {
        setError(t('auth.loginError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center p-4">
      <button
        onClick={toggleLanguage}
        className="fixed top-4 end-4 flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-full text-sm transition-colors"
      >
        <Globe className="h-4 w-4" />
        {isAr ? 'English' : 'العربية'}
      </button>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <AcademyLogo size={96} ring className="shadow-2xl border-4 border-white/20" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            {isAr ? branding.nameAr : branding.nameEn}
          </h1>
          <p className="text-white/70 text-sm mt-1">{branding.tagline}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-primary mb-6 text-center">
            {t('auth.login')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pe-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute inset-y-0 end-3 flex items-center text-muted-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground w-full mt-2"
              disabled={submitting}
            >
              {submitting
                ? (isAr ? 'جارٍ تسجيل الدخول...' : 'Signing in...')
                : t('auth.loginBtn')}
            </Button>
          </form>
        </div>

        <div className="text-center mt-6 flex items-center justify-center gap-2 opacity-60">
          <AcademyLogo size={18} />
          <p className="text-white/70 text-xs">{isAr ? branding.nameAr : branding.nameEn}</p>
        </div>
      </div>
    </div>
  );
}


