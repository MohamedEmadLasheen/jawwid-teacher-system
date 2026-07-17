import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown } from 'lucide-react';
import type { TeacherIntelligenceRow, WorkloadStatus } from '../utils/academyHealth';

const STATUS_COLOR: Record<WorkloadStatus, string> = {
  very_light: 'bg-blue-100 text-blue-700',
  balanced: 'bg-green-100 text-green-700',
  busy: 'bg-amber-100 text-amber-700',
  overloaded: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

type SortKey = keyof Pick<TeacherIntelligenceRow,
  'teacherName' | 'weeklyHours' | 'weeklyLessons' | 'primeTimeOccupancyPct' | 'totalOccupancyPct' |
  'availableHours' | 'emptyHours' | 'studentsCount' | 'preservationPct'>;

const COLUMNS: { key: SortKey; labelKey: string }[] = [
  { key: 'teacherName', labelKey: 'scheduling.intel.col.teacher' },
  { key: 'weeklyHours', labelKey: 'scheduling.intel.col.weeklyHours' },
  { key: 'weeklyLessons', labelKey: 'scheduling.intel.col.weeklyLessons' },
  { key: 'primeTimeOccupancyPct', labelKey: 'scheduling.intel.col.primeTimePct' },
  { key: 'totalOccupancyPct', labelKey: 'scheduling.intel.col.occupancyPct' },
  { key: 'availableHours', labelKey: 'scheduling.intel.col.availableHours' },
  { key: 'emptyHours', labelKey: 'scheduling.intel.col.emptyHours' },
  { key: 'studentsCount', labelKey: 'scheduling.intel.col.students' },
  { key: 'preservationPct', labelKey: 'scheduling.intel.col.preservation' },
];

export function TeacherIntelligenceTable({ rows }: { rows: TeacherIntelligenceRow[] }) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>('teacherName');
  const [asc, setAsc] = useState(true);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return asc ? cmp : -cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else { setSortKey(key); setAsc(true); }
  };

  return (
    <div className="overflow-x-auto border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(c.key)}>
                <span className="inline-flex items-center gap-1">{t(c.labelKey)} <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
            ))}
            <TableHead>{t('scheduling.intel.col.status')}</TableHead>
            <TableHead>{t('scheduling.intel.col.type')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.teacherId}>
              <TableCell className="font-medium whitespace-nowrap">{r.teacherName}</TableCell>
              <TableCell>{r.weeklyHours}h</TableCell>
              <TableCell>{r.weeklyLessons}</TableCell>
              <TableCell>{r.primeTimeOccupancyPct}%</TableCell>
              <TableCell>{r.totalOccupancyPct}%</TableCell>
              <TableCell>{r.availableHours}h</TableCell>
              <TableCell>{r.emptyHours}h</TableCell>
              <TableCell>{r.studentsCount}</TableCell>
              <TableCell>{r.preservationPct}%</TableCell>
              <TableCell><Badge className={STATUS_COLOR[r.workloadStatus]}>{t(`scheduling.intel.status.${r.workloadStatus}`)}</Badge></TableCell>
              <TableCell className="text-xs text-muted-foreground">{t(`teachers.${r.teacherType}`)}</TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">—</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
