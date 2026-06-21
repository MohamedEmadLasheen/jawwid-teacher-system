import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Key, Users, Shield, Globe, Lock, Unlock, AlertTriangle,
  CheckCircle2, XCircle, Eye, EyeOff, Crown, Building2, Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { verifyPassword } from '@/services/auth.service';
import {
  ROLE_PERMISSIONS,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  PERMISSION_CATEGORIES,
  isSuperAdminOnlyPermission,
} from '@/lib/permissions';
import type { Permission, UserRole } from '@/lib/types';
import { BrandingTab } from './BrandingTab';
import { BackupTab } from './BackupTab';

interface EmergencyConfirmProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  actionLabel: string;
}

function EmergencyConfirmDialog({ open, onConfirm, onCancel, actionLabel }: EmergencyConfirmProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { currentUser } = useAuthStore();
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleConfirm = async () => {
    if (!pw) {
      setError(isAr ? 'كلمة المرور مطلوبة' : 'Password is required');
      return;
    }
    setVerifying(true);
    setError('');
    const ok = await verifyPassword(currentUser?.email ?? '', pw);
    setVerifying(false);
    if (!ok) {
      setError(isAr ? 'كلمة المرور غير صحيحة' : 'Incorrect password');
      return;
    }
    setPw('');
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setPw(''); setError(''); onCancel(); } }}>
      <DialogContent className="w-[calc(100vw-32px)] max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary text-base">
            <Shield className="h-4 w-4 text-red-500 shrink-0" />
            {isAr ? 'تأكيد الوصول الأمني' : 'Security Access Confirmation'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isAr ? `إجراء حساس: "${actionLabel}"` : `Sensitive action: "${actionLabel}"`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              {isAr ? 'هذا الإجراء محمي ومخصص للمشرف العام فقط.' : 'This action is protected and reserved for Super Admin only.'}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">{isAr ? 'كلمة المرور' : 'Password'}</Label>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                value={pw}
                onChange={(e) => { setPw(e.target.value); setError(''); }}
                className="pe-10 h-10"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute inset-y-0 end-3 flex items-center text-muted-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <p className="text-xs text-muted-foreground">{isAr ? `المستخدم: ${currentUser?.name}` : `User: ${currentUser?.name}`}</p>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" disabled={verifying} onClick={() => { setPw(''); setError(''); onCancel(); }} className="w-full sm:w-auto">{isAr ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={handleConfirm} disabled={verifying} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
            <Shield className="h-4 w-4 me-2" />
            {verifying ? (isAr ? 'جارٍ التحقق...' : 'Verifying...') : (isAr ? 'تأكيد' : 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { currentUser, users, changePassword, addUser, updatePermissions } = useAuthStore();
  const { addLog } = useLogStore();
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '', role: 'admin' as UserRole });
  const [permOpen, setPermOpen] = useState(false);
  const [permUserId, setPermUserId] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>([]);
  const [pendingLockedPerms, setPendingLockedPerms] = useState<Permission[]>([]);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyAction, setEmergencyAction] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requireEmergencyConfirm = (label: string, action: () => void) => {
    setEmergencyAction(label);
    setPendingAction(() => action);
    setEmergencyOpen(true);
  };

  const handleEmergencyConfirmed = () => {
    setEmergencyOpen(false);
    pendingAction?.();
    setPendingAction(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg({ type: 'error', text: isAr ? 'كلمتا المرور غير متطابقتان' : 'Passwords do not match' });
      return;
    }
    if (pwForm.newPw.length < 6) {
      setPwMsg({ type: 'error', text: isAr ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters' });
      return;
    }
    try {
      if (currentUser) {
        await changePassword(currentUser.id, pwForm.newPw);
        addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'change_password', target: currentUser.name, details: 'تم تغيير كلمة المرور', tableName: 'auth' });
      }
      setPwMsg({ type: 'success', text: t('common.success') });
      setPwForm({ current: '', newPw: '', confirm: '' });
      setTimeout(() => setPwMsg(null), 3000);
    } catch {
      setPwMsg({ type: 'error', text: isAr ? 'حدث خطأ أثناء تغيير كلمة المرور' : 'Error changing password' });
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addUser({ name: adminForm.name, email: adminForm.email, role: adminForm.role, permissions: ROLE_PERMISSIONS[adminForm.role], isActive: true }, adminForm.password);
      if (currentUser) {
        addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'add_admin', target: adminForm.name, details: `إضافة مستخدم: ${adminForm.name} (${adminForm.role})`, tableName: 'users' });
      }
      setAddAdminOpen(false);
      setAdminForm({ name: '', email: '', password: '', role: 'admin' });
    } catch (err) {
      console.error('Failed to create user:', err);
    }
  };

  const openPermissions = (userId: string) => {
    const user = (users as unknown as Array<{ id: string; permissions: Permission[]; lockedPermissions?: Permission[] }>).find((u) => u.id === userId);
    if (user) {
      setPermUserId(userId);
      setSelectedPerms([...user.permissions]);
      setPendingLockedPerms([...(user.lockedPermissions ?? [])]);
      setPermOpen(true);
    }
  };

  const handleSavePermissions = () => {
    requireEmergencyConfirm(
      isAr ? 'تعديل صلاحيات المستخدم' : 'Modify User Permissions',
      async () => {
        await updatePermissions(permUserId, selectedPerms);
        const store = useAuthStore.getState();
        await store.setLockedPermissions(permUserId, pendingLockedPerms);
        if (currentUser) {
          addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'update_permissions', target: permUserId, details: 'تم تعديل الصلاحيات', tableName: 'users' });
        }
        setPermOpen(false);
      }
    );
  };

  const togglePerm = (perm: Permission) => {
    if (isSuperAdminOnlyPermission(perm)) return;
    if (pendingLockedPerms.includes(perm)) return;
    setSelectedPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);
  };

  const toggleLock = (perm: Permission) => {
    setPendingLockedPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    localStorage.setItem('jawwid_lang', newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  const nonSuperAdmins = (users as unknown as Array<{ id: string; name: string; email: string; role: UserRole; isActive: boolean; permissions: Permission[]; lockedPermissions?: Permission[] }>)
    .filter((u) => u.role !== 'super_admin');

  const permUser = nonSuperAdmins.find((u) => u.id === permUserId);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('settings.title')}</h1>

      <Tabs defaultValue="password">
        {/* Scrollable tabs on mobile */}
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="bg-gray-100 flex w-max min-w-full gap-0.5 h-auto p-1">
            <TabsTrigger value="password" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs sm:text-sm whitespace-nowrap px-2.5 py-1.5">
              <Key className="h-3.5 w-3.5 me-1 shrink-0" />{t('settings.changePassword')}
            </TabsTrigger>
            <TabsTrigger value="language" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs sm:text-sm whitespace-nowrap px-2.5 py-1.5">
              <Globe className="h-3.5 w-3.5 me-1 shrink-0" />{t('settings.language')}
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="branding" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs sm:text-sm whitespace-nowrap px-2.5 py-1.5">
                <Building2 className="h-3.5 w-3.5 me-1 shrink-0" />{isAr ? 'الهوية' : 'Branding'}
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs sm:text-sm whitespace-nowrap px-2.5 py-1.5">
                <Users className="h-3.5 w-3.5 me-1 shrink-0" />{t('settings.userManagement')}
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="permissions" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs sm:text-sm whitespace-nowrap px-2.5 py-1.5">
                <Shield className="h-3.5 w-3.5 me-1 shrink-0" />{isAr ? 'الصلاحيات' : 'Permissions'}
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="backup" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs sm:text-sm whitespace-nowrap px-2.5 py-1.5">
                <Database className="h-3.5 w-3.5 me-1 shrink-0" />{isAr ? 'النسخ الاحتياطي' : 'Backup'}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Password Tab */}
        <TabsContent value="password" className="mt-4">
          <Card className="max-w-md">
            <CardHeader className="pb-3"><CardTitle className="text-base text-primary">{t('settings.changePassword')}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                {pwMsg && (
                  <Alert className={pwMsg.type === 'success' ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}>
                    <AlertDescription className="flex items-center gap-2 text-sm">
                      {pwMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                      {pwMsg.text}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('settings.currentPassword')}</Label>
                  <Input type="password" value={pwForm.current} onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))} className="h-10" required />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('settings.newPassword')}</Label>
                  <Input type="password" value={pwForm.newPw} onChange={(e) => setPwForm((f) => ({ ...f, newPw: e.target.value }))} className="h-10" required />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('settings.confirmPassword')}</Label>
                  <Input type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} className="h-10" required />
                </div>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground w-full h-10">{t('settings.save')}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Language Tab */}
        <TabsContent value="language" className="mt-4">
          <Card className="max-w-md">
            <CardHeader className="pb-3"><CardTitle className="text-base text-primary">{t('settings.language')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {['ar', 'en'].map((lang) => (
                <div key={lang} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{lang === 'ar' ? 'العربية' : 'English'}</p>
                    <p className="text-xs text-muted-foreground">{lang === 'ar' ? 'RTL' : 'LTR'}</p>
                  </div>
                  <Badge className={i18n.language === lang ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'}>
                    {i18n.language === lang ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive')}
                  </Badge>
                </div>
              ))}
              <Button onClick={toggleLanguage} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground w-full h-10">
                {isAr ? 'Switch to English' : 'التبديل إلى العربية'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branding Tab */}
        {isSuperAdmin && (
          <TabsContent value="branding" className="mt-4">
            <BrandingTab />
          </TabsContent>
        )}

        {/* User Management Tab */}
        {isSuperAdmin && (
          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3 gap-2 flex-wrap">
                <CardTitle className="text-base text-primary">{t('settings.userManagement')}</CardTitle>
                <Button size="sm" onClick={() => setAddAdminOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs">
                  {t('settings.addAdmin')}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {nonSuperAdmins.map((user) => (
                    <div key={user.id} className="p-3 bg-gray-50 rounded-lg border">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                              {t(`roles.${user.role}`)}
                            </Badge>
                            <Badge className={`text-[10px] ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {user.isActive ? t('supervisors.active') : t('supervisors.inactive')}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {user.permissions.length} {isAr ? 'صلاحية' : 'perms'}
                            </Badge>
                            {(user.lockedPermissions?.length ?? 0) > 0 && (
                              <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                                <Lock className="h-2.5 w-2.5 me-0.5" />
                                {user.lockedPermissions?.length} {isAr ? 'مقفلة' : 'locked'}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="text-primary border-primary/30 hover:bg-primary/10 h-8 text-xs shrink-0" onClick={() => openPermissions(user.id)}>
                          <Shield className="h-3.5 w-3.5 me-1" />
                          {isAr ? 'الصلاحيات' : 'Perms'}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {nonSuperAdmins.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('common.noData')}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Permission Matrix Tab */}
        {isSuperAdmin && (
          <TabsContent value="permissions" className="mt-4">
            <div className="space-y-4">
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <Crown className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">
                        {isAr ? 'فصل صلاحيات المشرف العام عن مشرف النظام' : 'Super Admin vs System Admin Separation'}
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        {isAr
                          ? 'الصلاحيات المحجوزة للمشرف العام موضحة بأيقونة التاج.'
                          : 'Permissions reserved for Super Admin are marked with a crown icon.'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {PERMISSION_CATEGORIES.map((cat) => (
                <Card key={cat.key} className={cat.superAdminOnly ? 'border-red-200' : 'border-gray-200'}>
                  <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
                    <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                      {cat.superAdminOnly ? <Crown className="h-4 w-4 text-secondary shrink-0" /> : <Shield className="h-4 w-4 text-primary shrink-0" />}
                      {isAr ? cat.labelAr : cat.labelEn}
                      {cat.superAdminOnly && (
                        <Badge className="bg-red-100 text-red-800 text-[10px]">{isAr ? 'محجوز للمشرف العام' : 'Super Admin Only'}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-4 pb-3 overflow-x-auto">
                    <table className="w-full text-xs min-w-[400px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-start py-2 px-2 font-medium text-muted-foreground">{isAr ? 'الصلاحية' : 'Permission'}</th>
                          {(['super_admin', 'admin', 'operation_admin', 'quality_admin'] as UserRole[]).map((role) => (
                            <th key={role} className="text-center py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">{t(`roles.${role}`)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cat.permissions.map((perm) => (
                          <tr key={perm} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-2 text-gray-700">
                              <div className="flex items-center gap-1.5">
                                {cat.superAdminOnly && <Crown className="h-3 w-3 text-secondary shrink-0" />}
                                <span className="text-xs">{t(`permissions.${perm}`)}</span>
                              </div>
                            </td>
                            {(['super_admin', 'admin', 'operation_admin', 'quality_admin'] as UserRole[]).map((role) => (
                              <td key={role} className="py-2 px-2 text-center">
                                {role === 'super_admin' ? (
                                  <span className="text-green-600 font-bold">✓</span>
                                ) : cat.superAdminOnly ? (
                                  <span className="text-red-400 font-bold">✗</span>
                                ) : ROLE_PERMISSIONS[role].includes(perm) ? (
                                  <span className="text-green-600 font-bold">✓</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}

        {/* Backup Tab */}
        {isSuperAdmin && (
          <TabsContent value="backup" className="mt-4">
            <BackupTab />
          </TabsContent>
        )}
      </Tabs>

      {/* Add Admin Dialog */}
      <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">{t('settings.addAdmin')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddAdmin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">{isAr ? 'الاسم' : 'Name'} *</Label>
              <Input value={adminForm.name} onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))} className="h-10" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t('auth.email')} *</Label>
              <Input type="email" value={adminForm.email} onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))} className="h-10" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t('auth.password')} *</Label>
              <Input type="password" value={adminForm.password} onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))} className="h-10" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{isAr ? 'الدور' : 'Role'}</Label>
              <Select value={adminForm.role} onValueChange={(v) => setAdminForm((f) => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t('roles.admin')}</SelectItem>
                  <SelectItem value="operation_admin">{t('roles.operation_admin')}</SelectItem>
                  <SelectItem value="quality_admin">{t('roles.quality_admin')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                {isAr ? 'ملاحظة: لن يتمكن مشرف النظام من الوصول إلى صلاحيات المشرف العام المحجوزة.' : 'Note: System Admin will not have access to Super Admin reserved permissions.'}
              </p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setAddAdminOpen(false)} className="w-full sm:w-auto">{isAr ? 'إلغاء' : 'Cancel'}</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permission Builder Dialog */}
      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 shrink-0" />
              {isAr ? 'منشئ الصلاحيات' : 'Permission Builder'}
              {permUser && <span className="text-sm font-normal text-muted-foreground truncate">— {permUser.name}</span>}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isAr ? 'فعّل أو عطّل الصلاحيات. الصلاحيات المقفلة لا يمكن تغييرها إلا من قِبل المشرف العام.' : 'Enable or disable permissions. Locked permissions can only be changed by Super Admin.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> {isAr ? 'مفعّلة' : 'Enabled'}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block" /> {isAr ? 'معطّلة' : 'Disabled'}</span>
              <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-amber-600" /> {isAr ? 'مقفلة' : 'Locked'}</span>
              <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-secondary" /> {isAr ? 'محجوزة' : 'Reserved'}</span>
            </div>
            {/* Super Admin Only */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-4 w-4 text-secondary shrink-0" />
                <h4 className="text-xs font-semibold text-red-700">
                  {isAr ? 'صلاحيات محجوزة للمشرف العام فقط' : 'Reserved for Super Admin Only'}
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {SUPER_ADMIN_ONLY_PERMISSIONS.map((perm) => (
                  <div key={perm} className="flex items-center justify-between p-2 bg-red-50 rounded border border-red-100 opacity-70">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Crown className="h-3 w-3 text-secondary shrink-0" />
                      <span className="text-xs text-gray-600 truncate">{t(`permissions.${perm}`)}</span>
                    </div>
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            {PERMISSION_CATEGORIES.filter((c) => !c.superAdminOnly).map((cat) => (
              <div key={cat.key}>
                <h4 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 shrink-0" />
                  {isAr ? cat.labelAr : cat.labelEn}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {cat.permissions.map((perm) => {
                    const isEnabled = selectedPerms.includes(perm);
                    const isLocked = pendingLockedPerms.includes(perm);
                    return (
                      <div key={perm} className={`flex items-center justify-between p-2 rounded border transition-colors ${isLocked ? 'bg-amber-50 border-amber-200' : isEnabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Switch checked={isEnabled} onCheckedChange={() => togglePerm(perm)} disabled={isLocked} className="shrink-0 scale-90" />
                          <span className="text-xs text-gray-700 truncate">{t(`permissions.${perm}`)}</span>
                        </div>
                        <button type="button" onClick={() => toggleLock(perm)} className={`ms-1.5 p-1 rounded transition-colors shrink-0 ${isLocked ? 'text-amber-600 hover:text-amber-700 bg-amber-100' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'}`}>
                          {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700 font-medium mb-1">{isAr ? 'ملخص الصلاحيات' : 'Permissions Summary'}</p>
              <div className="flex flex-wrap gap-3 text-xs text-blue-600">
                <span>{isAr ? 'مفعّلة' : 'Enabled'}: <strong>{selectedPerms.length}</strong></span>
                <span>{isAr ? 'مقفلة' : 'Locked'}: <strong>{pendingLockedPerms.length}</strong></span>
                <span>{isAr ? 'محجوزة' : 'Reserved'}: <strong>{SUPER_ADMIN_ONLY_PERMISSIONS.length}</strong></span>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPermOpen(false)} className="w-full sm:w-auto">{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSavePermissions} className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto">
              <Shield className="h-4 w-4 me-2" />
              {isAr ? 'حفظ الصلاحيات' : 'Save Permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmergencyConfirmDialog
        open={emergencyOpen}
        actionLabel={emergencyAction}
        onConfirm={handleEmergencyConfirmed}
        onCancel={() => { setEmergencyOpen(false); setPendingAction(null); }}
      />
    </div>
  );
}

