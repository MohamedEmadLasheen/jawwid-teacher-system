import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useTeacherStore, computeRiskProfile, computePerformanceScore } from '@/store/teacherStore';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { TeacherForm } from './TeacherForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/EmptyState';
import { levelColors, riskColors, perfColors } from '@/lib/uiConstants';
import {
  Plus, Search, Eye, Edit, Trash2, RotateCcw, Filter, ChevronDown, ChevronUp, Users,
} from 'lucide-react';
import type { Teacher } from '@/lib/types';

export function TeachersPage() {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuthStore();
  const { addLog } = useLogStore();
  const {
    teachers, evaluations, complaints, improvementPlans, deductions,
    addTeacher, updateTeacher, softDeleteTeacher, restoreTeacher,
  } = useTeacherStore();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterRisk, setFilterRisk] = useState('all');
  const [filterSpec, setFilterSpec] = useState('all');
  const [filterCurrency, setFilterCurrency] = useState('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const filtered = teachers.filter((t) => {
    if (t.isDeleted !== showDeleted) return false;
    if (search && !t.fullName.toLowerCase().includes(search.toLowerCase()) &&
      !t.email.toLowerCase().includes(search.toLowerCase()) &&
      !t.phone.includes(search)) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterLevel !== 'all' && t.level !== filterLevel) return false;
    if (filterCurrency !== 'all' && t.salaryCurrency !== filterCurrency) return false;
    if (filterSpec !== 'all' && !t.specializations.includes(filterSpec as never)) return false;
    if (filterRisk !== 'all') {
      const { riskLevel } = computeRiskProfile(t.id, evaluations, complaints, improvementPlans, deductions);
      if (riskLevel !== filterRisk) return false;
    }
    return true;
  });

  const handleAdd = (data: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
    addTeacher(data);
    if (currentUser) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'إضافة معلم', target: data.fullName, details: 'تم إضافة معلم جديد' });
    }
    setShowForm(false);
  };

  const handleEdit = (data: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
    if (!editTeacher) return;
    updateTeacher(editTeacher.id, data);
    if (currentUser) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'تعديل معلم', target: editTeacher.fullName, details: 'تم تعديل بيانات المعلم' });
    }
    setEditTeacher(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const teacher = teachers.find((t) => t.id === deleteId);
    softDeleteTeacher(deleteId);
    if (currentUser && teacher) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'حذف معلم', target: teacher.fullName, details: 'تم حذف المعلم' });
    }
    setDeleteId(null);
  };


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('teachers.title')}</h1>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleted(!showDeleted)}
            className="text-xs"
          >
            {showDeleted ? t('teachers.title') : t('teachers.deletedTeachers')}
          </Button>
          <Button
            onClick={() => setShowForm(true)}
            size="sm"
            className="text-xs sm:text-sm"
          >
            <Plus className="h-4 w-4 me-1" />
            {t('teachers.addTeacher')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          {/* Search always visible */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('teachers.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
              <span className="hidden sm:inline">{t('common.filter')}</span>
              {filtersExpanded ? <ChevronUp className="h-3 w-3 ms-1" /> : <ChevronDown className="h-3 w-3 ms-1" />}
            </Button>
          </div>

          {/* Collapsible advanced filters */}
          {filtersExpanded && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t('teachers.filterByStatus')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('teachers.allStatuses')}</SelectItem>
                    <SelectItem value="active">{t('teachers.active')}</SelectItem>
                    <SelectItem value="inactive">{t('teachers.inactive')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterLevel} onValueChange={setFilterLevel}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t('teachers.filterByLevel')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('teachers.allLevels')}</SelectItem>
                    <SelectItem value="silver">{t('teachers.silver')}</SelectItem>
                    <SelectItem value="gold">{t('teachers.gold')}</SelectItem>
                    <SelectItem value="platinum">{t('teachers.platinum')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterRisk} onValueChange={setFilterRisk}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t('teachers.filterByRisk')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('teachers.allRisks')}</SelectItem>
                    <SelectItem value="low">{t('risk.low')}</SelectItem>
                    <SelectItem value="medium">{t('risk.medium')}</SelectItem>
                    <SelectItem value="high">{t('risk.high')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterCurrency} onValueChange={setFilterCurrency}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t('teachers.filterByCurrency')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('teachers.allCurrencies')}</SelectItem>
                    <SelectItem value="EGP">{t('currency.EGP')}</SelectItem>
                    <SelectItem value="USD">{t('currency.USD')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Specialization chips — scrollable on mobile */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex gap-1.5 flex-nowrap">
                  {['all', 'quran', 'arabic_language', 'islamic_studies', 'tajweed', 'noor_al_bayan', 'adults_quran', 'adults_arabic', 'english_language'].map((spec) => (
                    <button
                      key={spec}
                      onClick={() => setFilterSpec(spec)}
                      className={`px-2.5 py-1 rounded-full text-xs border whitespace-nowrap transition-colors shrink-0 ${
                        filterSpec === spec
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
                      }`}
                    >
                      {spec === 'all' ? t('common.all') : t(`specialization.${spec}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} {t('common.teacher')}
      </p>

      {/* Teacher Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('teachers.noTeachers')}
          description={search || filterStatus !== 'all' || filterLevel !== 'all' || filterRisk !== 'all' || filterSpec !== 'all'
            ? (i18n.language === 'ar' ? 'حاول تغيير معايير البحث أو الفلتر' : 'Try adjusting your search or filter criteria')
            : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((teacher) => {
            const { riskLevel, riskScore } = computeRiskProfile(teacher.id, evaluations, complaints, improvementPlans, deductions);
            const { score: perfScore, category: perfCat } = computePerformanceScore(teacher.id, evaluations, complaints, improvementPlans, deductions);
            const currSymbol = teacher.salaryCurrency === 'USD' ? '$' : 'ج.م';

            return (
              <Card key={teacher.id} className="hover:shadow-md transition-shadow overflow-hidden">
                <CardContent className="p-3 sm:p-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-2.5 gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                        {teacher.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{teacher.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{teacher.email}</p>
                      </div>
                    </div>
                    <Badge className={`shrink-0 text-xs ${teacher.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                      {t(`teachers.${teacher.status}`)}
                    </Badge>
                  </div>

                  {/* Specializations */}
                  <div className="flex flex-wrap gap-1 mb-2.5">
                    {teacher.specializations.slice(0, 2).map((spec) => (
                      <Badge key={spec} variant="outline" className="text-[10px] px-1.5 py-0">
                        {t(`specialization.${spec}`)}
                      </Badge>
                    ))}
                    {teacher.specializations.length > 2 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        +{teacher.specializations.length - 2}
                      </Badge>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2.5 text-center">
                    <div className="bg-gray-50 rounded p-1.5">
                      <p className="text-[10px] text-muted-foreground">{t('teachers.level')}</p>
                      <Badge className={`${levelColors[teacher.level]} text-[10px] mt-0.5 px-1`}>
                        {t(`teachers.${teacher.level}`)}
                      </Badge>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5">
                      <p className="text-[10px] text-muted-foreground">{t('risk.title')}</p>
                      <Badge className={`${riskColors[riskLevel]} text-[10px] mt-0.5 px-1`}>
                        {t(`risk.${riskLevel}`)} {riskScore}
                      </Badge>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5">
                      <p className="text-[10px] text-muted-foreground">{t('performance.score')}</p>
                      <Badge className={`${perfColors[perfCat]} text-[10px] mt-0.5 px-1`}>
                        {perfScore}%
                      </Badge>
                    </div>
                  </div>

                  {/* Salary */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2.5 gap-1">
                    <span className="truncate">{t('teachers.monthlySalary')}: <strong className="text-foreground">{currSymbol}{teacher.monthlySalary.toLocaleString()}</strong></span>
                    <span className="shrink-0">{t(`teachingMarket.${teacher.teachingMarket}`)}</span>
                  </div>

                  {/* Actions */}
                  <TooltipProvider>
                    <div className="flex gap-1.5">
                      <Link to={`/teachers/${teacher.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full text-xs h-8">
                          <Eye className="h-3 w-3 me-1" />
                          {t('teachers.viewProfile')}
                        </Button>
                      </Link>
                      {!teacher.isDeleted && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditTeacher(teacher)}
                                aria-label={t('teachers.editTeacher')}
                                className="text-xs h-8 w-8 p-0"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('teachers.editTeacher')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteId(teacher.id)}
                                aria-label={t('teachers.deleteTeacher')}
                                className="text-red-600 hover:text-red-700 text-xs h-8 w-8 p-0"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('teachers.deleteTeacher')}</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                      {teacher.isDeleted && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => restoreTeacher(teacher.id)}
                              aria-label={t('teachers.restore')}
                              className="text-green-600 text-xs h-8 w-8 p-0"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('teachers.restore')}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{t('teachers.addTeacher')}</DialogTitle>
          </DialogHeader>
          <TeacherForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTeacher} onOpenChange={() => setEditTeacher(null)}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{t('teachers.editTeacher')}</DialogTitle>
          </DialogHeader>
          {editTeacher && (
            <TeacherForm
              teacher={editTeacher}
              onSubmit={handleEdit}
              onCancel={() => setEditTeacher(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="w-[calc(100vw-32px)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('teachers.deleteTeacher')}</AlertDialogTitle>
            <AlertDialogDescription>{t('teachers.confirmDelete')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 w-full sm:w-auto">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}