import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { useDemoModeActive } from '@/features/settings/useDemoAcademy';

/** Shown app-wide whenever any is_demo = true row exists, so nobody mistakes
 * demo data (Demo Teacher 01, Demo Student 001, ...) for real academy data. */
export function DemoModeBanner() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { data: isActive } = useDemoModeActive();

  if (!isActive) return null;

  return (
    <div className="bg-amber-400 text-amber-950 text-xs sm:text-sm font-semibold text-center py-1.5 px-3 flex items-center justify-center gap-2 shrink-0">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      {isAr ? 'وضع البيانات التجريبية نشط — هذه ليست بيانات حقيقية' : 'DEMO MODE ACTIVE — this is not real academy data'}
    </div>
  );
}
