import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useShiftTemplates, useCreateShiftTemplate, useUpdateShiftTemplate, useDeleteShiftTemplate,
} from './hooks/useShiftTemplates';
import { ShiftTemplateForm } from './components/ShiftTemplateForm';
import { minuteToDisplayLabel } from './utils/timeGrid';
import { Button } from '@/components/ui/button';
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
import { EmptyState } from '@/components/ui/EmptyState';
import { Plus, Edit, Trash2, Clock } from 'lucide-react';
import type { ShiftTemplate } from '@/lib/types';

export function ShiftTemplatesPage() {
  const { t } = useTranslation();
  const { data: templates = [], isLoading } = useShiftTemplates();
  const createTemplate = useCreateShiftTemplate();
  const updateTemplate = useUpdateShiftTemplate();
  const deleteTemplate = useDeleteShiftTemplate();

  const [showForm, setShowForm] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ShiftTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleAdd = (data: Omit<ShiftTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    createTemplate.mutate(data);
    setShowForm(false);
  };

  const handleEdit = (data: Omit<ShiftTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editTemplate) return;
    updateTemplate.mutate({ id: editTemplate.id, updates: data });
    setEditTemplate(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteTemplate.mutate(deleteId);
    setDeleteId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('scheduling.shiftTemplates')}</h1>
        <Button onClick={() => setShowForm(true)} size="sm" className="text-xs sm:text-sm">
          <Plus className="h-4 w-4 me-1" />
          {t('scheduling.addShiftTemplate')}
        </Button>
      </div>

      {!isLoading && templates.length === 0 ? (
        <EmptyState icon={Clock} title={t('scheduling.noShiftTemplates')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between mb-2.5 gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{template.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {minuteToDisplayLabel(template.startMinute)}–{minuteToDisplayLabel(template.endMinute)}
                    </p>
                  </div>
                  <Badge className={`shrink-0 text-xs ${template.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                    {template.isActive ? t('courses.active') : t('courses.inactive')}
                  </Badge>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setEditTemplate(template)} className="flex-1 text-xs h-8">
                    <Edit className="h-3 w-3 me-1" />
                    {t('common.edit')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteId(template.id)} className="text-red-600 hover:text-red-700 text-xs h-8 w-8 p-0">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>{t('scheduling.addShiftTemplate')}</DialogTitle></DialogHeader>
          <ShiftTemplateForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTemplate} onOpenChange={() => setEditTemplate(null)}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>{t('scheduling.editShiftTemplate')}</DialogTitle></DialogHeader>
          {editTemplate && <ShiftTemplateForm template={editTemplate} onSubmit={handleEdit} onCancel={() => setEditTemplate(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="w-[calc(100vw-32px)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scheduling.deleteShiftTemplate')}</AlertDialogTitle>
            <AlertDialogDescription>{t('scheduling.confirmDeleteShiftTemplate')}</AlertDialogDescription>
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
