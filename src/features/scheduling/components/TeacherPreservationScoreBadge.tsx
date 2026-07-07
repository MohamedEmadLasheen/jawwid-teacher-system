import { useTranslation } from 'react-i18next';
import { useTeacherPreservationScore } from '../hooks/useTeacherPreservationScore';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

export function TeacherPreservationScoreBadge({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const { data } = useTeacherPreservationScore(lessonId);

  if (!data) return null;

  const color = data.score >= 80 ? 'bg-green-100 text-green-800' : data.score >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${color} text-xs`}>{t('scheduling.preservationScore')}: {data.score}%</Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('scheduling.breakdownTeacher')}: {data.breakdown.teacher} · {t('scheduling.breakdownDay')}: {data.breakdown.day} · {t('scheduling.breakdownTime')}: {data.breakdown.time}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
