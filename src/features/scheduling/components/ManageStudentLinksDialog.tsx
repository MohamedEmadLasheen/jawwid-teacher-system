import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Parent, StudentParent } from '@/lib/types';
import { useStudents } from '../hooks/useStudents';
import { useStudentParents, useLinkStudentParent, useUnlinkStudentParent } from '../hooks/useParents';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';

interface ManageStudentLinksDialogProps {
  parent: Parent;
}

export function ManageStudentLinksDialog({ parent }: ManageStudentLinksDialogProps) {
  const { t } = useTranslation();
  const { data: students = [] } = useStudents();
  const { data: links = [] } = useStudentParents();
  const linkStudentParent = useLinkStudentParent();
  const unlinkStudentParent = useUnlinkStudentParent();

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [relationship, setRelationship] = useState<StudentParent['relationship']>('guardian');

  const parentLinks = links.filter((l) => l.parentId === parent.id);
  const linkedStudentIds = new Set(parentLinks.map((l) => l.studentId));
  const availableStudents = students.filter((s) => !s.isDeleted && !linkedStudentIds.has(s.id));

  const handleAddLink = () => {
    if (!selectedStudentId) return;
    linkStudentParent.mutate({
      studentId: selectedStudentId,
      parentId: parent.id,
      relationship,
      isPrimaryContact: parentLinks.length === 0,
    });
    setSelectedStudentId('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {parentLinks.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('parents.noLinkedStudents')}</p>
        )}
        {parentLinks.map((link) => {
          const student = students.find((s) => s.id === link.studentId);
          return (
            <Badge key={link.id} variant="outline" className="gap-1 py-1">
              {student?.fullName ?? '—'}
              <span className="text-[10px] text-muted-foreground">({t(`parents.${link.relationship}`)})</span>
              <button type="button" onClick={() => unlinkStudentParent.mutate(link.id)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
          <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder={t('parents.selectStudent')} /></SelectTrigger>
          <SelectContent>
            {availableStudents.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={relationship} onValueChange={(v) => setRelationship(v as StudentParent['relationship'])}>
          <SelectTrigger className="h-9 text-sm w-32 shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mother">{t('parents.mother')}</SelectItem>
            <SelectItem value="father">{t('parents.father')}</SelectItem>
            <SelectItem value="guardian">{t('parents.guardian')}</SelectItem>
            <SelectItem value="other">{t('parents.other')}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={handleAddLink} disabled={!selectedStudentId} className="shrink-0">
          {t('common.add')}
        </Button>
      </div>
    </div>
  );
}
