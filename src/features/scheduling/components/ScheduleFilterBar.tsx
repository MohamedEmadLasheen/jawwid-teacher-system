import { useTranslation } from 'react-i18next';
import { useScheduleRoster } from '../hooks/useScheduleRoster';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useCourses } from '../hooks/useCourses';
import { useStudents } from '../hooks/useStudents';
import { useParentNameByStudentId } from '../hooks/useParents';
import { useScheduleUiStore } from '@/store/scheduleUiStore';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import { MultiSelectFilter } from './MultiSelectFilter';
import { labelToMinute, minuteToLabel } from '../utils/timeGrid';
import type { LessonGroupFilter } from '@/store/scheduleUiStore';
import type { TeacherType } from '@/lib/types';

const ALL = '__all__';

export function ScheduleFilterBar() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  // Filter options are the Schedule roster, not every teacher on record.
  const { rosterTeachers } = useScheduleRoster();
  const { supervisors } = useSupervisorStore();
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useStudents();
  const parentNameByStudentId = useParentNameByStudentId();
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

      <MultiSelectFilter
        placeholder={t('scheduling.allTeachers')}
        /* Dynamic collection: searchable by architecture, not by today's count. */
        searchable
        selectedIds={filters.teacherIds}
        onChange={(ids) => setFilter('teacherIds', ids)}
        options={rosterTeachers.map((tc) => ({ id: tc.id, label: tc.fullName, searchText: tc.id }))}
      />

      <MultiSelectFilter
        placeholder={t('scheduling.allStudents')}
        /* Dynamic collection: searchable by architecture, not by today's count. */
        searchable
        selectedIds={filters.studentIds}
        onChange={(ids) => setFilter('studentIds', ids)}
        options={students.filter((s) => !s.isDeleted).map((s) => ({
          id: s.id, label: s.fullName, searchText: `${parentNameByStudentId.get(s.id) ?? ''} ${s.id}`,
        }))}
      />

      <div className="flex items-center gap-1 shrink-0">
        <MultiSelectFilter
          className="w-36"
          placeholder={t('scheduling.allCourses')}
          /* Dynamic collection: searchable by architecture, not by today's count. */
          searchable
          selectedIds={filters.coursePendingOnly ? [] : filters.courseIds}
          onChange={(ids) => { setFilter('coursePendingOnly', false); setFilter('courseIds', ids); }}
          options={courses.map((c) => ({ id: c.id, label: isAr ? c.nameAr : c.nameEn }))}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <input
            type="checkbox"
            checked={filters.coursePendingOnly}
            onChange={(e) => { setFilter('coursePendingOnly', e.target.checked); if (e.target.checked) setFilter('courseIds', []); }}
          />
          {t('scheduling.coursePending')}
        </label>
      </div>

      <Select value={filters.teacherType ?? ALL} onValueChange={(v) => setFilter('teacherType', v === ALL ? null : v as TeacherType)}>
        <SelectTrigger className="h-9 text-sm w-36 shrink-0"><SelectValue placeholder={t('scheduling.allTeacherTypes')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('scheduling.allTeacherTypes')}</SelectItem>
          <SelectItem value="hourly">{t('teachers.hourly')}</SelectItem>
          <SelectItem value="shift">{t('teachers.shift')}</SelectItem>
        </SelectContent>
      </Select>

      <MultiSelectFilter
        placeholder={t('scheduling.allSupervisors')}
        /* Dynamic collection: searchable by architecture, not by today's count. */
        searchable
        selectedIds={filters.supervisorIds}
        onChange={(ids) => setFilter('supervisorIds', ids)}
        options={supervisors.filter((s) => s.status === 'active').map((s) => ({ id: s.id, label: s.name }))}
      />

      <MultiSelectFilter
        placeholder={t('scheduling.allStatuses')}
        selectedIds={filters.lifecycleStatuses}
        onChange={(ids) => setFilter('lifecycleStatuses', ids as typeof filters.lifecycleStatuses)}
        options={(['trial', 'active', 'paused', 'ended'] as const).map((s) => ({ id: s, label: t(`scheduling.lifecycle.${s}`) }))}
      />

      <Select value={filters.groupFilter ?? ALL} onValueChange={(v) => setFilter('groupFilter', v === ALL ? null : v as LessonGroupFilter)}>
        <SelectTrigger className="h-9 text-sm w-36 shrink-0"><SelectValue placeholder={t('scheduling.allLessonTypes')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('scheduling.allLessonTypes')}</SelectItem>
          <SelectItem value="group">{t('scheduling.groupLesson')}</SelectItem>
          <SelectItem value="one_to_one">{t('scheduling.hover.oneToOne')}</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1 shrink-0">
        <Input
          type="time"
          className="h-9 w-28 text-sm"
          value={filters.timeRangeStart !== null ? minuteToLabel(filters.timeRangeStart) : ''}
          onChange={(e) => setFilter('timeRangeStart', e.target.value ? labelToMinute(e.target.value) : null)}
        />
        <span className="text-muted-foreground text-sm">–</span>
        <Input
          type="time"
          className="h-9 w-28 text-sm"
          value={filters.timeRangeEnd !== null ? minuteToLabel(filters.timeRangeEnd) : ''}
          onChange={(e) => setFilter('timeRangeEnd', e.target.value ? labelToMinute(e.target.value) : null)}
        />
      </div>

      <label className="flex items-center gap-2 h-9 px-1 shrink-0">
        <Switch checked={filters.primeTimeOnly} onCheckedChange={(v) => setFilter('primeTimeOnly', v)} />
        <Label className="text-sm cursor-pointer">{t('scheduling.primeTimeOnly')}</Label>
      </label>

      {/* Both switches are the same state the Free time / Outside shift legend
          chips toggle — one field each, so the two controls can never disagree. */}
      <label className="flex items-center gap-2 h-9 px-1 shrink-0">
        <Switch checked={filters.availableOnly} onCheckedChange={(v) => setFilter('availableOnly', v)} />
        <Label className="text-sm cursor-pointer">{t('scheduling.availableOnly')}</Label>
      </label>

      <label className="flex items-center gap-2 h-9 px-1 shrink-0">
        <Switch checked={filters.outsideShiftOnly} onCheckedChange={(v) => setFilter('outsideShiftOnly', v)} />
        <Label className="text-sm cursor-pointer">{t('scheduling.outsideShiftOnly')}</Label>
      </label>
    </div>
  );
}
