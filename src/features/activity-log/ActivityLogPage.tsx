import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search, Filter, Download, Trash2, Monitor, Smartphone, Tablet,
  Globe, Clock, User, Shield, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useLogStore, type EnhancedActivityLog } from '@/store/logStore';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 20;

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-blue-100 text-blue-700',
  logout: 'bg-gray-100 text-gray-700',
  add_teacher: 'bg-emerald-100 text-emerald-700',
  edit_teacher: 'bg-amber-100 text-amber-700',
  delete_teacher: 'bg-red-100 text-red-700',
  restore_teacher: 'bg-purple-100 text-purple-700',
  add_supervisor: 'bg-emerald-100 text-emerald-700',
  edit_supervisor: 'bg-amber-100 text-amber-700',
  delete_supervisor: 'bg-red-100 text-red-700',
  export_data: 'bg-orange-100 text-orange-700',
  add_evaluation: 'bg-blue-100 text-blue-700',
  role_change: 'bg-purple-100 text-purple-700',
  change_password: 'bg-amber-100 text-amber-700',
  update_permissions: 'bg-purple-100 text-purple-700',
  add_admin: 'bg-emerald-100 text-emerald-700',
  system_setting_changed: 'bg-orange-100 text-orange-700',
  backup_created: 'bg-teal-100 text-teal-700',
  add_bonus: 'bg-emerald-100 text-emerald-700',
  add_deduction: 'bg-red-100 text-red-700',
  add_complaint: 'bg-red-100 text-red-700',
  add_plan: 'bg-blue-100 text-blue-700',
};

const ACTION_TYPES = [
  'login', 'logout', 'add_teacher', 'edit_teacher', 'delete_teacher', 'restore_teacher',
  'add_supervisor', 'edit_supervisor', 'delete_supervisor', 'export_data',
  'add_evaluation', 'role_change', 'change_password', 'update_permissions',
  'add_admin', 'system_setting_changed', 'backup_created',
  'add_bonus', 'add_deduction', 'add_complaint', 'add_plan',
];

function DeviceIcon({ device }: { device: string }) {
  if (device === 'Mobile') return <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />;
  if (device === 'Tablet') return <Tablet className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Monitor className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function ActivityLogPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as 'ar' | 'en';
  const isAr = lang === 'ar';
  const { logs, clearLogs, deleteLog } = useLogStore();
  const { currentUser } = useAuthStore();
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [detailLog, setDetailLog] = useState<EnhancedActivityLog | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        !search ||
        log.userName.toLowerCase().includes(search.toLowerCase()) ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.details.toLowerCase().includes(search.toLowerCase()) ||
        (log.target ?? '').toLowerCase().includes(search.toLowerCase());
      const matchAction = actionFilter === 'all' || log.action === actionFilter;
      const matchRole = roleFilter === 'all' || log.userRole === roleFilter;
      const matchFrom = !dateFrom || new Date(log.timestamp) >= new Date(dateFrom);
      const matchTo = !dateTo || new Date(log.timestamp) <= new Date(dateTo + 'T23:59:59');
      return matchSearch && matchAction && matchRole && matchFrom && matchTo;
    });
  }, [logs, search, actionFilter, roleFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCSV = () => {
    const headers = ['User', 'Role', 'Action', 'Target', 'Details', 'Before', 'After', 'IP', 'Browser', 'Device', 'Timestamp'];
    const rows = filtered.map((l) => [
      l.userName, l.userRole, l.action, l.target ?? '', l.details,
      l.beforeValue ?? '', l.afterValue ?? '',
      l.ip ?? '', l.browser ?? '', l.device ?? '',
      l.timestamp,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('activityLog.title')}</h1>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {filtered.length} {isAr ? 'سجل' : 'records'}
          </Badge>
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-primary border-primary/30 text-xs h-8">
            <Download className="h-3.5 w-3.5 me-1" />
            <span className="hidden sm:inline">{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
            <span className="sm:hidden">CSV</span>
          </Button>
          {isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)} className="text-red-500 border-red-300 hover:bg-red-50 text-xs h-8">
              <Trash2 className="h-3.5 w-3.5 me-1" />
              <span className="hidden sm:inline">{isAr ? 'مسح الكل' : 'Clear All'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          {/* Search + toggle */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={isAr ? 'بحث...' : 'Search...'}
                className="ps-9 h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              className="shrink-0 h-9 px-3"
            >
              <Filter className="h-4 w-4 me-1" />
              <span className="hidden sm:inline">{isAr ? 'فلترة' : 'Filter'}</span>
              {filtersExpanded ? <ChevronUp className="h-3 w-3 ms-1" /> : <ChevronDown className="h-3 w-3 ms-1" />}
            </Button>
          </div>

          {filtersExpanded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={isAr ? 'نوع الإجراء' : 'Action Type'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? 'جميع الإجراءات' : 'All Actions'}</SelectItem>
                  {ACTION_TYPES.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={isAr ? 'الدور' : 'Role'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? 'جميع الأدوار' : 'All Roles'}</SelectItem>
                  <SelectItem value="super_admin">{t('roles.super_admin')}</SelectItem>
                  <SelectItem value="admin">{t('roles.admin')}</SelectItem>
                  <SelectItem value="operation_admin">{t('roles.operation_admin')}</SelectItem>
                  <SelectItem value="quality_admin">{t('roles.quality_admin')}</SelectItem>
                </SelectContent>
              </Select>
              <div className="space-y-0.5">
                <Label className="text-xs text-muted-foreground">{isAr ? 'من' : 'From'}</Label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="h-9 text-xs" />
              </div>
              <div className="space-y-0.5">
                <Label className="text-xs text-muted-foreground">{isAr ? 'إلى' : 'To'}</Label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="h-9 text-xs" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log List */}
      <Card>
        <CardContent className="p-0">
          {paginated.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">{t('activityLog.noLogs')}</p>
          ) : (
            <div className="divide-y">
              {paginated.map((log) => (
                <div
                  key={log.id}
                  className="p-3 sm:p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setDetailLog(log)}
                >
                  {/* Mobile: stacked layout */}
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {/* Row 1: user + role + action */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[120px] sm:max-w-none">{log.userName}</span>
                        </span>
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 shrink-0">
                          <Shield className="h-2.5 w-2.5 me-0.5" />
                          {t(`roles.${log.userRole}`)}
                        </Badge>
                        <Badge className={`text-[10px] shrink-0 ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                          {log.action}
                        </Badge>
                      </div>
                      {/* Row 2: details */}
                      <p className="text-xs sm:text-sm text-gray-700 line-clamp-2">{log.details}</p>
                      {/* Row 3: before/after */}
                      {(log.beforeValue || log.afterValue) && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {log.beforeValue && (
                            <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              {isAr ? 'قبل' : 'Before'}: {log.beforeValue}
                            </span>
                          )}
                          {log.afterValue && (
                            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                              {isAr ? 'بعد' : 'After'}: {log.afterValue}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Row 4: meta — visible on all sizes */}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(log.timestamp, lang)}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <DeviceIcon device={log.device ?? 'Desktop'} />
                          {log.browser ?? '—'}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Globe className="h-3 w-3" />
                          {log.ip ?? '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-8 w-8 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {isAr ? `${page} / ${totalPages}` : `${page} / ${totalPages}`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailLog} onOpenChange={() => setDetailLog(null)}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">
              {isAr ? 'تفاصيل السجل' : 'Log Details'}
            </DialogTitle>
          </DialogHeader>
          {detailLog && (
            <div className="space-y-2 text-sm">
              {[
                { label: isAr ? 'المستخدم' : 'User', value: detailLog.userName },
                { label: isAr ? 'الدور' : 'Role', value: t(`roles.${detailLog.userRole}`) },
                { label: isAr ? 'الإجراء' : 'Action', value: detailLog.action },
                { label: isAr ? 'الهدف' : 'Target', value: detailLog.target ?? '—' },
                { label: isAr ? 'الجدول' : 'Table', value: detailLog.tableName ?? '—' },
                { label: isAr ? 'التفاصيل' : 'Details', value: detailLog.details },
                { label: isAr ? 'القيمة قبل' : 'Before Value', value: detailLog.beforeValue ?? '—' },
                { label: isAr ? 'القيمة بعد' : 'After Value', value: detailLog.afterValue ?? '—' },
                { label: 'IP', value: detailLog.ip ?? '—' },
                { label: isAr ? 'المتصفح' : 'Browser', value: detailLog.browser ?? '—' },
                { label: isAr ? 'الجهاز' : 'Device', value: detailLog.device ?? '—' },
                { label: isAr ? 'الوقت' : 'Timestamp', value: formatDateTime(detailLog.timestamp, lang) },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-2">
                  <span className="font-medium text-muted-foreground w-28 shrink-0 text-xs">{label}:</span>
                  <span className="text-gray-800 break-all text-xs">{value}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            {isSuperAdmin && detailLog && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 border-red-300 w-full sm:w-auto"
                onClick={() => { deleteLog(detailLog.id); setDetailLog(null); }}
              >
                <Trash2 className="h-3.5 w-3.5 me-1" />
                {isAr ? 'حذف هذا السجل' : 'Delete This Log'}
              </Button>
            )}
            <Button onClick={() => setDetailLog(null)} className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto">
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Clear Dialog */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {isAr ? 'تأكيد مسح جميع السجلات' : 'Confirm Clear All Logs'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد من مسح جميع سجلات النشاط؟'
              : 'This action cannot be undone. Are you sure you want to clear all activity logs?'}
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setConfirmClear(false)} className="w-full sm:w-auto">{t('common.cancel')}</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
              onClick={() => { clearLogs(); setConfirmClear(false); }}
            >
              {isAr ? 'نعم، مسح الكل' : 'Yes, Clear All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}