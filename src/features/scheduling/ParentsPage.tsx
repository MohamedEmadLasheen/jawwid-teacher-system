import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesSearch } from '@/lib/searchMatch';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import {
  useParents, useCreateParent, useUpdateParent, useSoftDeleteParent, useRestoreParent, useStudentParents,
} from './hooks/useParents';
import { ParentForm } from './components/ParentForm';
import { ManageStudentLinksDialog } from './components/ManageStudentLinksDialog';
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
import { Plus, Search, Edit, Trash2, RotateCcw, Users2, Link2 } from 'lucide-react';
import type { Parent } from '@/lib/types';

export function ParentsPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuthStore();
  const { addLog } = useLogStore();

  const { data: parents = [], isLoading } = useParents();
  const { data: links = [] } = useStudentParents();
  const createParent = useCreateParent();
  const updateParent = useUpdateParent();
  const softDeleteParent = useSoftDeleteParent();
  const restoreParent = useRestoreParent();

  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editParent, setEditParent] = useState<Parent | null>(null);
  const [linksParent, setLinksParent] = useState<Parent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = parents.filter((p) => {
    if (p.isDeleted !== showDeleted) return false;
    if (search && !matchesSearch(`${p.fullName} ${p.phone}`, search)) return false;
    return true;
  });

  const handleAdd = (data: Omit<Parent, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
    createParent.mutate(data);
    if (currentUser) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'إضافة ولي أمر', target: data.fullName, details: 'تم إضافة ولي أمر جديد', tableName: 'parents' });
    }
    setShowForm(false);
  };

  const handleEdit = (data: Omit<Parent, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
    if (!editParent) return;
    updateParent.mutate({ id: editParent.id, updates: data });
    if (currentUser) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'تعديل ولي أمر', target: editParent.fullName, details: 'تم تعديل بيانات ولي الأمر', tableName: 'parents' });
    }
    setEditParent(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const parent = parents.find((p) => p.id === deleteId);
    softDeleteParent.mutate(deleteId);
    if (currentUser && parent) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'حذف ولي أمر', target: parent.fullName, details: 'تم حذف ولي الأمر', tableName: 'parents' });
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('parents.title')}</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowDeleted(!showDeleted)} className="text-xs">
            {showDeleted ? t('parents.title') : t('parents.deletedParents')}
          </Button>
          <Button onClick={() => setShowForm(true)} size="sm" className="text-xs sm:text-sm">
            <Plus className="h-4 w-4 me-1" />
            {t('parents.addParent')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('parents.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9 h-9"
            />
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{filtered.length} {t('parents.title')}</p>

      {!isLoading && filtered.length === 0 ? (
        <EmptyState icon={Users2} title={t('parents.noParents')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((parent) => {
            const linkedCount = links.filter((l) => l.parentId === parent.id).length;
            return (
              <Card key={parent.id} className="hover:shadow-md transition-shadow overflow-hidden">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between mb-2.5 gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                        {parent.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{parent.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{parent.phone || '—'}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">{linkedCount} {t('parents.students')}</Badge>
                  </div>

                  <TooltipProvider>
                    <div className="flex gap-1.5">
                      {!parent.isDeleted && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setLinksParent(parent)} aria-label={t('parents.manageStudents')} className="flex-1 text-xs h-8">
                                <Link2 className="h-3 w-3 me-1" />
                                {t('parents.manageStudents')}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('parents.manageStudents')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setEditParent(parent)} aria-label={t('parents.editParent')} className="text-xs h-8 w-8 p-0">
                                <Edit className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('parents.editParent')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setDeleteId(parent.id)} aria-label={t('parents.deleteParent')} className="text-red-600 hover:text-red-700 text-xs h-8 w-8 p-0">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('parents.deleteParent')}</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                      {parent.isDeleted && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => restoreParent.mutate(parent.id)} aria-label={t('parents.restore')} className="flex-1 text-green-600 text-xs h-8">
                              <RotateCcw className="h-3 w-3 me-1" />
                              {t('parents.restore')}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('parents.restore')}</TooltipContent>
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
          <DialogHeader><DialogTitle>{t('parents.addParent')}</DialogTitle></DialogHeader>
          <ParentForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editParent} onOpenChange={() => setEditParent(null)}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>{t('parents.editParent')}</DialogTitle></DialogHeader>
          {editParent && <ParentForm parent={editParent} onSubmit={handleEdit} onCancel={() => setEditParent(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!linksParent} onOpenChange={() => setLinksParent(null)}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>{t('parents.manageStudents')} — {linksParent?.fullName}</DialogTitle></DialogHeader>
          {linksParent && <ManageStudentLinksDialog parent={linksParent} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="w-[calc(100vw-32px)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('parents.deleteParent')}</AlertDialogTitle>
            <AlertDialogDescription>{t('parents.confirmDelete')}</AlertDialogDescription>
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
