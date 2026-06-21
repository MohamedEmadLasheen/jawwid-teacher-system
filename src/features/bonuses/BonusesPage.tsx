import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore, formatCurrency } from '@/store/teacherStore';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/EmptyState';
import { approvalStatusColors } from '@/lib/uiConstants';
import { Plus, TrendingUp, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import type { BonusCategory, SalaryCurrency } from '@/lib/types';
import { format } from 'date-fns';

const BONUS_CATEGORIES: BonusCategory[] = [
  'outstanding_evaluation', 'attendance_excellence', 'student_retention',
  'admin_excellence', 'special_achievement',
];

type PendingAction =
  | { type: 'approve'; id: string }
  | { type: 'reject'; id: string }
  | { type: 'delete'; id: string }
  | null;

export function BonusesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { currentUser } = useAuthStore();
  const { teachers, bonuses, addBonus, updateBonusApproval, deleteBonus } = useTeacherStore();

  const [showForm, setShowForm] = useState(false);
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [form, setForm] = useState({
    teacherId: '',
    date: new Date().toISOString().split('T')[0],
    category: 'outstanding_evaluation' as BonusCategory,
    currency: 'EGP' as SalaryCurrency,
    amount: 0,
    percentage: 0,
    reason: '',
    notes: '',
  });

  const activeTeachers = teachers.filter((t) => !t.isDeleted);

  const filtered = bonuses.filter((b) => {
    if (filterTeacher !== 'all' && b.teacherId !== filterTeacher) return false;
    if (filterStatus !== 'all' && b.approvalStatus !== filterStatus) return false;
    return true;
  });

  const totalEGP = filtered.filter((b) => b.currency === 'EGP').reduce((s, b) => s + b.amount, 0);
  const totalUSD = filtered.filter((b) => b.currency === 'USD').reduce((s, b) => s + b.amount, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyEGP = bonuses.filter((b) => b.createdAt.startsWith(thisMonth) && b.currency === 'EGP').reduce((s, b) => s + b.amount, 0);
  const monthlyUSD = bonuses.filter((b) => b.createdAt.startsWith(thisMonth) && b.currency === 'USD').reduce((s, b) => s + b.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addBonus({ ...form, supervisorName: currentUser?.name ?? '', approvalStatus: 'pending' });
    setShowForm(false);
    setForm({ teacherId: '', date: new Date().toISOString().split('T')[0], category: 'outstanding_evaluation', currency: 'EGP', amount: 0, percentage: 0, reason: '', notes: '' });
  };

  const confirmAction = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'approve') updateBonusApproval(pendingAction.id, 'approved');
    if (pendingAction.type === 'reject') updateBonusApproval(pendingAction.id, 'rejected');
    if (pendingAction.type === 'delete') deleteBonus(pendingAction.id);
    setPendingAction(null);
  };

  const getTeacherName = (id: string) => teachers.find((t) => t.id === id)?.fullName ?? id;

  const exportCSV = () => {
    const rows = [
      ['المعلم', 'التاريخ', 'الفئة', 'العملة', 'المبلغ', 'السبب', 'الحالة'],
      ...filtered.map((b) => [getTeacherName(b.teacherId), b.date, b.category, b.currency, b.amount, b.reason, b.approvalStatus]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'bonuses.csv'; a.click();
  };

  const confirmLabel = pendingAction?.type === 'approve'
    ? (isAr ? 'تأكيد القبول' : 'Confirm Approval')
    : pendingAction?.type === 'reject'
    ? (isAr ? 'تأكيد الرفض' : 'Confirm Rejection')
    : (isAr ? 'تأكيد الحذف' : 'Confirm Delete');

  const confirmDesc = pendingAction?.type === 'approve'
    ? (isAr ? 'هل تريد قبول هذه المكافأة؟' : 'Are you sure you want to approve this bonus?')
    : pendingAction?.type === 'reject'
    ? (isAr ? 'هل تريد رفض هذه المكافأة؟' : 'Are you sure you want to reject this bonus?')
    : (isAr ? 'سيتم حذف هذه المكافأة نهائياً.' : 'This bonus will be permanently deleted.');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('bonus.title')}</h1>
        <div className="flex gap-2 flex-wrap">
          {currentUser?.role === 'super_admin' && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs h-8">{t('common.exportCSV')}</Button>
          )}
          <Button onClick={() => setShowForm(true)} size="sm" className="text-xs sm:text-sm h-8 sm:h-9">
            <Plus className="h-4 w-4 me-1" />
            {t('bonus.addBonus')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: `${t('bonus.monthlyTotal')} (EGP)`, value: formatCurrency(monthlyEGP, 'EGP'), color: 'text-green-600' },
          { label: `${t('bonus.monthlyTotal')} (USD)`, value: formatCurrency(monthlyUSD, 'USD'), color: 'text-green-600' },
          { label: `${t('bonus.yearlyTotal')} (EGP)`, value: formatCurrency(totalEGP, 'EGP'), color: 'text-primary' },
          { label: `${t('bonus.yearlyTotal')} (USD)`, value: formatCurrency(totalUSD, 'USD'), color: 'text-primary' },
        ].map((item) => (
          <Card key={item.label} className="overflow-hidden">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 mb-1">{item.label}</p>
              <p className={`text-base sm:text-lg font-bold ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
          <SelectTrigger className="w-full sm:w-44 h-9 text-sm"><SelectValue placeholder={t('common.teacher')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {activeTeachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-44 h-9 text-sm"><SelectValue placeholder={t('bonus.approvalStatus')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="pending">{t('bonus.pending')}</SelectItem>
            <SelectItem value="approved">{t('bonus.approved')}</SelectItem>
            <SelectItem value="rejected">{t('bonus.rejected')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bonus List */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
          <CardTitle className="text-primary text-sm sm:text-base">
            {t('bonus.title')} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-4 pb-3">
          {filtered.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title={t('bonus.noBonuses')}
              description={isAr ? 'لم يتم تسجيل أي مكافآت بعد' : 'No bonuses have been recorded yet'}
            />
          ) : (
            <div className="space-y-2.5">
              {filtered.map((bonus) => (
                <div key={bonus.id} className="p-3 bg-green-50 rounded-lg border border-green-100">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <TrendingUp className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{getTeacherName(bonus.teacherId)}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {t(`bonus.${bonus.category}`)} — {bonus.reason}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(bonus.date), 'dd/MM/yyyy')} · {bonus.supervisorName}
                        </p>
                      </div>
                    </div>
                    {/* Amount + status */}
                    <div className="text-end shrink-0">
                      <p className="font-bold text-green-600 text-base">+{formatCurrency(bonus.amount, bonus.currency)}</p>
                      <Badge className={`text-[10px] mt-0.5 ${approvalStatusColors[bonus.approvalStatus] ?? ''}`}>
                        {t(`bonus.${bonus.approvalStatus}`)}
                      </Badge>
                    </div>
                  </div>
                  {/* Action buttons */}
                  {currentUser?.role === 'super_admin' && (
                    <div className="flex gap-1.5 flex-wrap">
                      {bonus.approvalStatus === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-300 h-7 text-xs"
                            onClick={() => setPendingAction({ type: 'approve', id: bonus.id })}
                          >
                            <CheckCircle2 className="h-3 w-3 me-1" />
                            {isAr ? 'قبول' : 'Approve'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 h-7 text-xs"
                            onClick={() => setPendingAction({ type: 'reject', id: bonus.id })}
                          >
                            <XCircle className="h-3 w-3 me-1" />
                            {isAr ? 'رفض' : 'Reject'}
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 h-7 text-xs"
                        onClick={() => setPendingAction({ type: 'delete', id: bonus.id })}
                      >
                        <Trash2 className="h-3 w-3 me-1" />
                        {isAr ? 'حذف' : 'Delete'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Bonus Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('bonus.addBonus')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">{t('common.teacher')} *</Label>
              <Select value={form.teacherId} onValueChange={(v) => setForm({ ...form, teacherId: v })}>
                <SelectTrigger className="h-10"><SelectValue placeholder={isAr ? 'اختر معلماً' : 'Select teacher'} /></SelectTrigger>
                <SelectContent>
                  {activeTeachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{t('bonus.category')}</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as BonusCategory })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BONUS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`bonus.${c}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t('bonus.currency')}</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as SalaryCurrency })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EGP">{t('currency.EGP')}</SelectItem>
                    <SelectItem value="USD">{t('currency.USD')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t('bonus.amount')}</Label>
                <Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t('common.date')}</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t('bonus.reason')}</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t('bonus.notes')}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="submit" className="w-full sm:w-auto">{t('common.save')}</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="w-full sm:w-auto">{t('common.cancel')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!pendingAction} onOpenChange={(o) => !o && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmLabel}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              className={pendingAction?.type === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {isAr ? 'تأكيد' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
