import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import {
  useStudents, useCreateStudent, useUpdateStudent, useSoftDeleteStudent, useRestoreStudent,
} from './hooks/useStudents';
import { StudentForm } from './components/StudentForm';
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
import { Plus, Search, Edit, Trash2, RotateCcw, GraduationCap } from 'lucide-react';
import type { Student } from '@/lib/types';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  trial: 'bg-blue-100 text-blue-800',
  withdrawn: 'bg-gray-100 text-gray-700',
};

export function StudentsPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuthStore();
  const { addLog } = useLogStore();

  const { data: students = [], isLoading } = useStudents();
  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent();
  const softDeleteStudent = useSoftDeleteStudent();
  const restoreStudent = useRestoreStudent();
  const { supervisors } = useSupervisorStore();
  const supervisorById = new Map(supervisors.map((s) => [s.id, s]));

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSupervisor, setFilterSupervisor] = useState('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = students.filter((s) => {
    if (s.isDeleted !== showDeleted) return false;
    if (search && !s.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (filterSupervisor !== 'all' && s.supervisorId !== filterSupervisor) return false;
    return true;
  });

  const handleAdd = (data: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
    createStudent.mutate(data);
    if (currentUser) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'إضافة طالب', target: data.fullName, details: 'تم إضافة طالب جديد', tableName: 'students' });
    }
    setShowForm(false);
  };

  const handleEdit = (data: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
    if (!editStudent) return;
    updateStudent.mutate({ id: editStudent.id, updates: data });
    if (currentUser) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'تعديل طالب', target: editStudent.fullName, details: 'تم تعديل بيانات الطالب', tableName: 'students' });
    }
    setEditStudent(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const student = students.find((s) => s.id === deleteId);
    softDeleteStudent.mutate(deleteId);
    if (currentUser && student) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'حذف طالب', target: student.fullName, details: 'تم حذف الطالب', tableName: 'students' });
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('students.title')}</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowDeleted(!showDeleted)} className="text-xs">
            {showDeleted ? t('students.title') : t('students.deletedStudents')}
          </Button>
          <Button onClick={() => setShowForm(true)} size="sm" className="text-xs sm:text-sm">
            <Plus className="h-4 w-4 me-1" />
            {t('students.addStudent')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('students.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ps-9 h-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-sm w-40 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('students.allStatuses')}</SelectItem>
                <SelectItem value="active">{t('students.active')}</SelectItem>
                <SelectItem value="paused">{t('students.paused')}</SelectItem>
                <SelectItem value="trial">{t('students.trial')}</SelectItem>
                <SelectItem value="withdrawn">{t('students.withdrawn')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSupervisor} onValueChange={setFilterSupervisor}>
              <SelectTrigger className="h-9 text-sm w-48 shrink-0"><SelectValue placeholder={t('students.supervisor')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {supervisors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="inline-flex items-center gap-2">
                      {s.colorHex && (
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.colorHex }} />
                      )}
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{filtered.length} {t('students.title')}</p>

      {!isLoading && filtered.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t('students.noStudents')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((student) => {
            const supervisor = student.supervisorId ? supervisorById.get(student.supervisorId) : undefined;
            return (
            <Card key={student.id} className="hover:shadow-md transition-shadow overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between mb-2.5 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${supervisor?.colorHex ? 'text-white' : 'bg-primary text-primary-foreground'}`}
                      style={supervisor?.colorHex ? { backgroundColor: supervisor.colorHex } : undefined}
                    >
                      {student.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{student.fullName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {supervisor?.name || student.country || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={`text-xs ${statusColors[student.status]}`}>
                      {t(`students.${student.status}`)}
                    </Badge>
                    {student.isReturning && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t('students.isReturning')}</Badge>
                    )}
                  </div>
                </div>

                <TooltipProvider>
                  <div className="flex gap-1.5">
                    {!student.isDeleted && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => setEditStudent(student)} aria-label={t('students.editStudent')} className="flex-1 text-xs h-8">
                              <Edit className="h-3 w-3 me-1" />
                              {t('common.edit')}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('students.editStudent')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => setDeleteId(student.id)} aria-label={t('students.deleteStudent')} className="text-red-600 hover:text-red-700 text-xs h-8 w-8 p-0">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('students.deleteStudent')}</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                    {student.isDeleted && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => restoreStudent.mutate(student.id)} aria-label={t('students.restore')} className="flex-1 text-green-600 text-xs h-8">
                            <RotateCcw className="h-3 w-3 me-1" />
                            {t('students.restore')}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('students.restore')}</TooltipContent>
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

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>{t('students.addStudent')}</DialogTitle></DialogHeader>
          <StudentForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editStudent} onOpenChange={() => setEditStudent(null)}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>{t('students.editStudent')}</DialogTitle></DialogHeader>
          {editStudent && <StudentForm student={editStudent} onSubmit={handleEdit} onCancel={() => setEditStudent(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="w-[calc(100vw-32px)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('students.deleteStudent')}</AlertDialogTitle>
            <AlertDialogDescription>{t('students.confirmDelete')}</AlertDialogDescription>
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
