import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import {
  useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse,
} from './hooks/useCourses';
import { CourseForm } from './components/CourseForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Plus, Search, Edit, Trash2, BookOpen } from 'lucide-react';
import type { Course } from '@/lib/types';

export function CoursesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { currentUser } = useAuthStore();
  const { addLog } = useLogStore();

  const { data: courses = [], isLoading } = useCourses();
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = courses.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.nameEn.toLowerCase().includes(q) || c.nameAr.toLowerCase().includes(q);
  });

  const handleAdd = (data: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>) => {
    createCourse.mutate(data);
    if (currentUser) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'إضافة مادة', target: data.nameAr, details: 'تم إضافة مادة جديدة', tableName: 'courses' });
    }
    setShowForm(false);
  };

  const handleEdit = (data: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editCourse) return;
    updateCourse.mutate({ id: editCourse.id, updates: data });
    if (currentUser) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'تعديل مادة', target: editCourse.nameAr, details: 'تم تعديل بيانات المادة', tableName: 'courses' });
    }
    setEditCourse(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const course = courses.find((c) => c.id === deleteId);
    deleteCourse.mutate(deleteId);
    if (currentUser && course) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'حذف مادة', target: course.nameAr, details: 'تم حذف المادة', tableName: 'courses' });
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('courses.title')}</h1>
        <Button onClick={() => setShowForm(true)} size="sm" className="text-xs sm:text-sm">
          <Plus className="h-4 w-4 me-1" />
          {t('courses.addCourse')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('courses.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9 h-9"
            />
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{filtered.length} {t('courses.title')}</p>

      {!isLoading && filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('courses.noCourses')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((course) => (
            <Card key={course.id} className="hover:shadow-md transition-shadow overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between mb-2.5 gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{isAr ? course.nameAr : course.nameEn}</p>
                    <p className="text-xs text-muted-foreground truncate">{t(`specialization.${course.category}`)}</p>
                  </div>
                  <Badge className={`shrink-0 text-xs ${course.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                    {course.isActive ? t('courses.active') : t('courses.inactive')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2.5">{t('courses.defaultDuration')}: {course.defaultDurationMinutes} {t('courses.minutes')}</p>

                <TooltipProvider>
                  <div className="flex gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => setEditCourse(course)} aria-label={t('courses.editCourse')} className="flex-1 text-xs h-8">
                          <Edit className="h-3 w-3 me-1" />
                          {t('common.edit')}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('courses.editCourse')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => setDeleteId(course.id)} aria-label={t('courses.deleteCourse')} className="text-red-600 hover:text-red-700 text-xs h-8 w-8 p-0">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('courses.deleteCourse')}</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>{t('courses.addCourse')}</DialogTitle></DialogHeader>
          <CourseForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCourse} onOpenChange={() => setEditCourse(null)}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>{t('courses.editCourse')}</DialogTitle></DialogHeader>
          {editCourse && <CourseForm course={editCourse} onSubmit={handleEdit} onCancel={() => setEditCourse(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="w-[calc(100vw-32px)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('courses.deleteCourse')}</AlertDialogTitle>
            <AlertDialogDescription>{t('courses.confirmDelete')}</AlertDialogDescription>
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
