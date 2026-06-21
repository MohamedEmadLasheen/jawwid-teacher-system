import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore, formatCurrency } from '@/store/teacherStore';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Plus, TrendingDown, Trash2 } from 'lucide-react';
import type { DeductionCategory, SalaryCurrency } from '@/lib/types';
import { format } from 'date-fns';

const DEDUCTION_CATEGORIES: DeductionCategory[] = [
  'absence', 'late_attendance', 'policy_violation', 'complaint_penalty', 'admin_violation',
];

export function DeductionsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { currentUser } = useAuthStore();
  const { teachers, deductions, addDeduction, deleteDeduction } = useTeacherStore();

  const [showForm, setShowForm] = useState(false);
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    teacherId: '',
    date: new Date().toISOString().split('T')[0],
    category: 'absence' as DeductionCategory,
    currency: 'EGP' as SalaryCurrency,
    amount: 0,
    percentage: 0,
    reason: '',
    notes: '',
  });

  const activeTeachers = teachers.filter((t) => !t.isDeleted);

  const filtered = deductions.filter((d) => {
    if (filterTeacher !== 'all' && d.teacherId !== filterTeacher) return false;
    if (filterCategory !== 'all' && d.category !== filterCategory) return false;
    return true;
  });

  const totalEGP = filtered.filter((d) => d.currency === 'EGP').reduce((s, d) => s + d.amount, 0);
  const totalUSD = filtered.filter((d) => d.currency === 'USD').reduce((s, d) => s + d.amount, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyEGP = deductions.filter((d) => d.createdAt.startsWith(thisMonth) && d.currency === 'EGP').reduce((s, d) => s + d.amount, 0);
  const monthlyUSD = deductions.filter((d) => d.createdAt.startsWith(thisMonth) && d.currency === 'USD').reduce((s, d) => s + d.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addDeduction({ ...form, supervisorName: currentUser?.name ?? '' });
    setShowForm(false);
    setForm({ teacherId: '', date: new Date().toISOString().split('T')[0], category: 'absence', currency: 'EGP', amount: 0, percentage: 0, reason: '', notes: '' });
  };

  const getTeacherName = (id: string) => teachers.find((t) => t.id === id)?.fullName ?? id;

  const exportCSV = () => {
    const rows = [
      ['المعلم', 'التاريخ', 'الفئة', 'العملة', 'المبلغ', 'السبب'],
      ...filtered.map((d) => [getTeacherName(d.teacherId), d.date, d.category, d.currency, d.amount, d.reason]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'deductions.csv'; a.click();
  };

  return (
    <TooltipProvider>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('deduction.title')}</h1>
          <div className="flex gap-2 flex-wrap">
            {currentUser?.role === 'super_admin' && (
              <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs h-8">{t('common.exportCSV')}</Button>
            )}
            <Button onClick={() => setShowForm(true)} size="sm" className="text-xs sm:text-sm h-8 sm:h-9">
              <Plus className="h-4 w-4 me-1" />
              {t('deduction.addDeduction')}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: `${t('deduction.monthlyTotal')} (EGP)`, value: formatCurrency(monthlyEGP, 'EGP'), color: 'text-red-600' },
            { label: `${t('deduction.monthlyTotal')} (USD)`, value: formatCurrency(monthlyUSD, 'USD'), color: 'text-red-600' },
            { label: `${t('deduction.yearlyTotal')} (EGP)`, value: formatCurrency(totalEGP, 'EGP'), color: 'text-primary' },
            { label: `${t('deduction.yearlyTotal')} (USD)`, value: formatCurrency(totalUSD, 'USD'), color: 'text-primary' },
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
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-44 h-9 text-sm"><SelectValue placeholder={t('deduction.category')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {DEDUCTION_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`deduction.${c}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Deduction List */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
            <CardTitle className="text-primary text-sm sm:text-base">
              {t('deduction.title')} ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4 pb-3">
            {filtered.length === 0 ? (
              <EmptyState
                icon={TrendingDown}
                title={t('deduction.noDeductions')}
                description={isAr ? 'لم يتم تسجيل أي خصومات بعد' : 'No deductions have been recorded yet'}
              />
            ) : (
              <div className="space-y-2.5">
                {filtered.map((ded) => (
                  <div key={ded.id} className="p-3 bg-red-50 rounded-lg border border-red-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <TrendingDown className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{getTeacherName(ded.teacherId)}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {t(`deduction.${ded.category}`)} — {ded.reason}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(ded.date), 'dd/MM/yyyy')} · {ded.supervisorName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <p className="font-bold text-red-600 text-base">-{formatCurrency(ded.amount, ded.currency)}</p>
                        {currentUser?.role === 'super_admin' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-red-500 h-7 w-7"
                                aria-label={isAr ? 'حذف الخصم' : 'Delete deduction'}
                                onClick={() => setDeleteId(ded.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              {isAr ? 'حذف' : 'Delete'}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Dialog */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('deduction.addDeduction')}</DialogTitle>
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
                  <Label className="text-sm">{t('deduction.category')}</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as DeductionCategory })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEDUCTION_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`deduction.${c}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('deduction.currency')}</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as SalaryCurrency })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EGP">{t('currency.EGP')}</SelectItem>
                      <SelectItem value="USD">{t('currency.USD')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('deduction.amount')}</Label>
                  <Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('common.date')}</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t('deduction.reason')}</Label>
                <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t('deduction.notes')}</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="submit" className="w-full sm:w-auto">{t('common.save')}</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="w-full sm:w-auto">{t('common.cancel')}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isAr ? 'تأكيد الحذف' : 'Confirm Delete'}</AlertDialogTitle>
              <AlertDialogDescription>
                {isAr ? 'سيتم حذف هذا الخصم نهائياً.' : 'This deduction will be permanently deleted.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (deleteId) deleteDeduction(deleteId); setDeleteId(null); }}
              >
                {isAr ? 'حذف' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
