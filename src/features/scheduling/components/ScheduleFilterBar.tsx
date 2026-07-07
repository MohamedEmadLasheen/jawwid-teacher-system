import { useTranslation } from 'react-i18next';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useCourses } from '../hooks/useCourses';
import { useScheduleUiStore } from '@/store/scheduleUiStore';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import type { LessonLifecycleStatus, TeacherType } from '@/lib/types';

const ALL = '__all__';

export function ScheduleFilterBar() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { teachers } = useTeacherStore();
  const { supervisors } = useSupervisorStore();
  const { data: courses = [] } = useCourses();
  const { searchQuery, setSearchQuery, filters, setFilter } = useScheduleUiStore();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('scheduling.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ps-9 h-9"
        />
      </div>

      <Select value={filters.teacherId ?? ALL} onValueChange={(v) => setFilter('teacherId', v === ALL ? null : v)}>
        <SelectTrigger className="h-9 text-sm w-40 shrink-0"><SelectValue placeholder={t('scheduling.allTeachers')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('scheduling.allTeachers')}</SelectItem>
          {teachers.filter((tc) => !tc.isDeleted).map((tc) => (
            <SelectItem key={tc.id} value={tc.id}>{tc.fullName}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.coursePendingOnly ? 'pending' : filters.courseId ?? ALL}
        onValueChange={(v) => {
          if (v === 'pending') { setFilter('coursePendingOnly', true); setFilter('courseId', null); }
          else { setFilter('coursePendingOnly', false); setFilter('courseId', v === ALL ? null : v); }
        }}
      >
        <SelectTrigger className="h-9 text-sm w-40 shrink-0"><SelectValue placeholder={t('scheduling.allCourses')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('scheduling.allCourses')}</SelectItem>
          <SelectItem value="pending">{t('scheduling.coursePending')}</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>{isAr ? c.nameAr : c.nameEn}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.teacherType ?? ALL} onValueChange={(v) => setFilter('teacherType', v === ALL ? null : v as TeacherType)}>
        <SelectTrigger className="h-9 text-sm w-36 shrink-0"><SelectValue placeholder={t('scheduling.allTeacherTypes')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('scheduling.allTeacherTypes')}</SelectItem>
          <SelectItem value="hourly">{t('teachers.hourly')}</SelectItem>
          <SelectItem value="shift">{t('teachers.shift')}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.supervisorId ?? ALL} onValueChange={(v) => setFilter('supervisorId', v === ALL ? null : v)}>
        <SelectTrigger className="h-9 text-sm w-40 shrink-0"><SelectValue placeholder={t('scheduling.allSupervisors')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('scheduling.allSupervisors')}</SelectItem>
          {supervisors.filter((s) => s.status === 'active').map((s) => (
            <SelectItem key={s.id} value={s.id}>
              <span className="inline-flex items-center gap-2">
                {s.colorHex && <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.colorHex }} />}
                {s.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.lifecycleStatus ?? ALL} onValueChange={(v) => setFilter('lifecycleStatus', v === ALL ? null : v as LessonLifecycleStatus)}>
        <SelectTrigger className="h-9 text-sm w-36 shrink-0"><SelectValue placeholder={t('scheduling.allStatuses')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('scheduling.allStatuses')}</SelectItem>
          <SelectItem value="trial">{t('scheduling.lifecycle.trial')}</SelectItem>
          <SelectItem value="active">{t('scheduling.lifecycle.active')}</SelectItem>
          <SelectItem value="paused">{t('scheduling.lifecycle.paused')}</SelectItem>
          <SelectItem value="ended">{t('scheduling.lifecycle.ended')}</SelectItem>
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 h-9 px-1 shrink-0">
        <Switch checked={filters.availableOnly} onCheckedChange={(v) => setFilter('availableOnly', v)} />
        <Label className="text-sm cursor-pointer">{t('scheduling.availableOnly')}</Label>
      </label>
    </div>
  );
}
