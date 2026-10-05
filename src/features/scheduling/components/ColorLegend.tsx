import { useTranslation } from 'react-i18next';
import { useSupervisorStore } from '@/store/supervisorStore';

export function ColorLegend() {
  const { t } = useTranslation();
  const { supervisors } = useSupervisorStore();
  const activeSupervisors = supervisors.filter((s) => s.status === 'active' && s.colorHex);

  const statusStyles: { key: string; className: string }[] = [
    { key: 'trial', className: 'border-dashed' },
    { key: 'active', className: 'border-solid' },
    { key: 'paused', className: 'border-dotted' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {activeSupervisors.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: s.colorHex! }} />
          {s.name}
        </span>
      ))}
      <span className="w-px h-4 bg-border" />
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border-2 border-red-300" />
        {t('scheduling.freeCapacity')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm bg-gray-200 border border-gray-300" />
        {t('scheduling.outsideShift')}
      </span>
      <span className="w-px h-4 bg-border" />
      {statusStyles.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className={`inline-block w-3 h-3 rounded-sm border-2 border-gray-400 ${s.className}`} />
          {t(`scheduling.lifecycle.${s.key}`)}
        </span>
      ))}
    </div>
  );
}
