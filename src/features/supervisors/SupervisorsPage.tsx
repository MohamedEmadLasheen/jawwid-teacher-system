import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, UserX, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import type { Supervisor, Permission } from '@/lib/types';

const ALL_PERMISSIONS: Permission[] = [
  'manage_teachers', 'view_reports', 'view_evaluations',
  'teacher_onboarding', 'teacher_followup', 'operational_notes',
  'teacher_evaluations', 'quality_monitoring', 'performance_reviews',
  'manage_complaints', 'improvement_plans',
];

export function SupervisorsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const {
    supervisors, addSupervisor, updateSupervisor, deleteSupervisor,
    disableSupervisor, updateSupervisorPermissions,
  } = useSupervisorStore();
  const { currentUser } = useAuthStore();
  const { addLog } = useLogStore();

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canManage = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supervisor | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [permOpen, setPermOpen] = useState(false);
  const [permSupervisor, setPermSupervisor] = useState<Supervisor | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>([]);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', department: '',
    status: 'active' as 'active' | 'inactive',
    password: '',
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', department: '', status: 'active', password: '' });
    setFormOpen(true);
  };

  const openEdit = (s: Supervisor) => {
    setEditing(s);
    setForm({ name: s.name, email: s.email, phone: s.phone, department: s.department, status: s.status, password: '' });
    setFormOpen(true);
  };

  const openPermissions = (s: Supervisor) => {
    setPermSupervisor(s);
    setSelectedPerms([...s.permissions]);
    setPermOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { password, ...fields } = form;
    try {
      if (editing) {
        await updateSupervisor(editing.id, fields);
        if (currentUser) {
          addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'edit_supervisor', target: fields.name, details: `تعديل مشرف: ${fields.name}` });
        }
      } else {
        await addSupervisor({ ...fields, permissions: [] }, password);
        if (currentUser) {
          addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'add_supervisor', target: fields.name, details: `إضافة مشرف: ${fields.name}` });
        }
      }
      setFormOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : (isAr ? 'فشل الحفظ' : 'Failed to save'));
    }
  };

  const handleDelete = (id: string) => {
    const s = supervisors.find((sv) => sv.id === id);
    deleteSupervisor(id);
    if (currentUser && s) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'delete_supervisor', target: s.name, details: `حذف مشرف: ${s.name}` });
    }
    setDeleteId(null);
  };

  const handleSavePermissions = () => {
    if (permSupervisor) updateSupervisorPermissions(permSupervisor.id, selectedPerms);
    setPermOpen(false);
  };

  const togglePerm = (perm: Permission) => {
    setSelectedPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('supervisors.title')}</h1>
        {canManage && (
          <Button size="sm" onClick={openAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm">
            <Plus className="h-4 w-4 me-1" />
            {t('supervisors.addSupervisor')}
          </Button>
        )}
      </div>

      {/* Mobile-first card list */}
      {supervisors.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">{t('supervisors.noSupervisors')}</div>
      ) : (
        <>
          {/* Desktop table — hidden on mobile */}
          <Card className="hidden md:block border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-start py-3 px-4 font-semibold text-gray-700">{t('supervisors.name')}</th>
                      <th className="text-start py-3 px-4 font-semibold text-gray-700">{t('supervisors.email')}</th>
                      <th className="text-start py-3 px-4 font-semibold text-gray-700">{t('supervisors.department')}</th>
                      <th className="text-start py-3 px-4 font-semibold text-gray-700">{t('supervisors.status')}</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {supervisors.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-800">{s.name}</td>
                        <td className="py-3 px-4 text-gray-600">{s.email}</td>
                        <td className="py-3 px-4 text-gray-600">{s.department}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className={s.status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-red-100 text-red-700 border-red-300'}>
                            {t(`supervisors.${s.status}`)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            {canManage && (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:bg-amber-50" onClick={() => openEdit(s)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={() => openPermissions(s)}>
                                  <Shield className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-500 hover:bg-orange-50" onClick={() => disableSupervisor(s.id)}>
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {isSuperAdmin && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(s.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {supervisors.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                      {s.department && <p className="text-xs text-muted-foreground">{s.department}</p>}
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-xs ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-red-100 text-red-700 border-red-300'}`}>
                      {t(`supervisors.${s.status}`)}
                    </Badge>
                  </div>
                  {/* Action buttons */}
                  <div className="flex gap-1.5 flex-wrap">
                    {canManage && (
                      <>
                        <Button variant="outline" size="sm" className="h-8 text-xs text-amber-600 border-amber-200" onClick={() => openEdit(s)}>
                          <Pencil className="h-3 w-3 me-1" />{t('common.edit')}
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs text-primary border-primary/20" onClick={() => openPermissions(s)}>
                          <Shield className="h-3 w-3 me-1" />{t('supervisors.permissions')}
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs text-orange-500 border-orange-200" onClick={() => disableSupervisor(s.id)}>
                          <UserX className="h-3 w-3 me-1" />{t('supervisors.inactive')}
                        </Button>
                      </>
                    )}
                    {isSuperAdmin && (
                      <Button variant="outline" size="sm" className="h-8 text-xs text-red-500 border-red-200" onClick={() => setDeleteId(s.id)}>
                        <Trash2 className="h-3 w-3 me-1" />{t('common.delete')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">
              {editing ? t('supervisors.editSupervisor') : t('supervisors.addSupervisor')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">{t('supervisors.name')} *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-10" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t('supervisors.email')} *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-10" required />
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label className="text-sm">{isAr ? 'كلمة المرور' : 'Password'} *</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="h-10"
                  minLength={8}
                  required
                  placeholder={isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}
                />
                <p className="text-[11px] text-muted-foreground">
                  {isAr
                    ? 'سيسجّل المشرف الدخول بهذا البريد وكلمة المرور، وفق الصلاحيات الممنوحة له.'
                    : 'The supervisor logs in with this email and password, scoped to the permissions you grant.'}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">{t('supervisors.phone')}</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t('supervisors.department')}</Label>
              <Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t('supervisors.status')}</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as 'active' | 'inactive' }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('supervisors.active')}</SelectItem>
                  <SelectItem value="inactive">{t('supervisors.inactive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">{t('common.cancel')}</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary text-base">
              {t('supervisors.permissions')} — {permSupervisor?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 py-2">
            {ALL_PERMISSIONS.map((perm) => (
              <div key={perm} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50">
                <Checkbox
                  id={perm}
                  checked={selectedPerms.includes(perm)}
                  onCheckedChange={() => togglePerm(perm)}
                  className="shrink-0"
                />
                <label htmlFor={perm} className="text-xs text-gray-700 cursor-pointer leading-tight">
                  {t(`permissions.${perm}`)}
                </label>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPermOpen(false)} className="w-full sm:w-auto">{t('common.cancel')}</Button>
            <Button onClick={handleSavePermissions} className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto">{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="w-[calc(100vw-32px)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('teachers.confirmDelete')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)} className="bg-red-500 hover:bg-red-600 text-white w-full sm:w-auto">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}