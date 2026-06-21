import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User, Mail, Phone, Briefcase, Building2, Shield,
  Clock, Key, LogOut, Bell, Moon, Globe, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { currentUser, changePassword, logout } = useAuthStore();
  const { logs } = useLogStore();
  const isAr = i18n.language === 'ar';

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  if (!currentUser) return null;

  const userLogs = logs.filter((l) => l.userId === currentUser.id).slice(0, 10);

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: t('profile.passwordMismatch') });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ type: 'error', text: isAr ? 'ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† 6 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„' : 'Password must be at least 6 characters' });
      return;
    }
    changePassword(currentUser.id, newPw);
    setPwMsg({ type: 'success', text: t('profile.passwordChanged') });
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setTimeout(() => setPwMsg(null), 3000);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'â€”';
    try { return format(new Date(dateStr), 'dd MMM yyyy', { locale: isAr ? ar : undefined }); }
    catch { return dateStr; }
  };

  const roleColors: Record<string, string> = {
    super_admin: 'bg-purple-100 text-purple-800',
    admin: 'bg-blue-100 text-blue-800',
    operation_admin: 'bg-green-100 text-green-800',
    quality_admin: 'bg-orange-100 text-orange-800',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-2xl font-bold">
          {currentUser.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-primary">{currentUser.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={roleColors[currentUser.role] || 'bg-gray-100 text-gray-800'}>
              {t(`roles.${currentUser.role}`)}
            </Badge>
            <Badge className={currentUser.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
              {currentUser.isActive ? t('profile.active') : t('profile.inactive')}
            </Badge>
          </div>
        </div>
      </div>

      <Tabs defaultValue="personal">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="personal">{t('profile.personalInfo')}</TabsTrigger>
          <TabsTrigger value="account">{t('profile.accountInfo')}</TabsTrigger>
          <TabsTrigger value="security">{t('profile.security')}</TabsTrigger>
          <TabsTrigger value="preferences">{t('profile.preferences')}</TabsTrigger>
          <TabsTrigger value="activity">{t('profile.activityHistory')}</TabsTrigger>
        </TabsList>

        {/* Personal Info */}
        <TabsContent value="personal">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <User className="h-5 w-5" />
                {t('profile.personalInfo')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InfoRow icon={<User className="h-4 w-4" />} label={t('profile.fullName')} value={currentUser.name} />
              <InfoRow icon={<Mail className="h-4 w-4" />} label={t('profile.email')} value={currentUser.email} />
              <InfoRow icon={<Phone className="h-4 w-4" />} label={t('profile.phone')} value={currentUser.phone || 'â€”'} />
              <InfoRow icon={<Briefcase className="h-4 w-4" />} label={t('profile.position')} value={currentUser.position || t(`roles.${currentUser.role}`)} />
              <InfoRow icon={<Building2 className="h-4 w-4" />} label={t('profile.department')} value={currentUser.department || 'Ø£ÙƒØ§Ø¯ÙŠÙ…ÙŠØ© Ø¬ÙˆÙÙ‘Ø¯'} />
              <InfoRow icon={<Shield className="h-4 w-4" />} label={t('profile.accountStatus')} value={currentUser.isActive ? t('profile.active') : t('profile.inactive')} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Info */}
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Clock className="h-5 w-5" />
                {t('profile.accountInfo')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InfoRow icon={<Clock className="h-4 w-4" />} label={t('profile.accountCreated')} value={formatDate(currentUser.createdAt)} />
              <InfoRow icon={<Clock className="h-4 w-4" />} label={t('profile.lastLogin')} value={formatDate(currentUser.lastLogin)} />
              <InfoRow icon={<Key className="h-4 w-4" />} label={t('profile.lastPasswordChange')} value={formatDate(currentUser.lastPasswordChange)} />
              <InfoRow icon={<Shield className="h-4 w-4" />} label={t('profile.accountStatus')} value={currentUser.isActive ? t('profile.active') : t('profile.inactive')} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Key className="h-5 w-5" />
                  {t('profile.changePassword')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                  <div className="space-y-1">
                    <Label>{t('profile.currentPassword')}</Label>
                    <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('profile.newPassword')}</Label>
                    <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('profile.confirmPassword')}</Label>
                    <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
                  </div>
                  {pwMsg && (
                    <Alert className={pwMsg.type === 'success' ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}>
                      <AlertDescription className="flex items-center gap-2">
                        {pwMsg.type === 'success'
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <AlertCircle className="h-4 w-4 text-red-600" />}
                        {pwMsg.text}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    {t('profile.saveChanges')}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <LogOut className="h-5 w-5" />
                  {t('profile.logoutAllDevices')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {isAr ? 'Ø³ÙŠØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø®Ø±ÙˆØ¬Ùƒ Ù…Ù† Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø¬Ù‡Ø²Ø© Ø§Ù„Ù…ØªØµÙ„Ø© Ø¨Ø­Ø³Ø§Ø¨Ùƒ.' : 'This will log you out from all devices connected to your account.'}
                </p>
                <Button variant="destructive" onClick={logout}>
                  <LogOut className="h-4 w-4 me-2" />
                  {t('profile.logoutAllDevices')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Shield className="h-5 w-5" />
                  {t('profile.twoFactorAuth')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{isAr ? 'Ø§Ù„Ù…ØµØ§Ø¯Ù‚Ø© Ø§Ù„Ø«Ù†Ø§Ø¦ÙŠØ©' : 'Two-Factor Authentication'}</p>
                    <p className="text-xs text-muted-foreground">{isAr ? 'ØºÙŠØ± Ù…ÙØ¹Ù‘Ù„Ø© Ø­Ø§Ù„ÙŠØ§Ù‹' : 'Currently disabled'}</p>
                  </div>
                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                    {isAr ? 'Ù‚Ø±ÙŠØ¨Ø§Ù‹' : 'Coming Soon'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Preferences */}
        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Globe className="h-5 w-5" />
                {t('profile.preferences')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y">
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{t('profile.language')}</p>
                    <p className="text-xs text-muted-foreground">{isAr ? 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© (RTL)' : 'English (LTR)'}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => i18n.changeLanguage(isAr ? 'en' : 'ar')}>
                  {isAr ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©'}
                </Button>
              </div>
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Moon className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{t('profile.darkMode')}</p>
                    <p className="text-xs text-muted-foreground">{isAr ? 'Ø§Ù„ÙˆØ¶Ø¹ Ø§Ù„Ø¯Ø§ÙƒÙ†' : 'Dark theme'}</p>
                  </div>
                </div>
                <Switch checked={darkMode} onCheckedChange={setDarkMode} />
              </div>
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{t('profile.notifications')}</p>
                    <p className="text-xs text-muted-foreground">{isAr ? 'ØªÙ„Ù‚ÙŠ Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª' : 'Receive notifications'}</p>
                  </div>
                </div>
                <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity History */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Clock className="h-5 w-5" />
                {t('profile.activityHistory')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {userLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{t('activityLog.noLogs')}</p>
              ) : (
                <div className="space-y-3">
                  {userLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{log.action}</p>
                        <p className="text-xs text-muted-foreground">{log.target} â€” {log.details}</p>
                      </div>
                      <p className="text-xs text-muted-foreground flex-shrink-0">
                        {format(new Date(log.timestamp), 'dd/MM HH:mm')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border">
      <span className="text-primary mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

