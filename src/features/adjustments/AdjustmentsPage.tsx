import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { BonusesPage } from '@/features/bonuses/BonusesPage';
import { DeductionsPage } from '@/features/deductions/DeductionsPage';

/** Thin tab container over the existing Bonuses/Deductions pages — no CRUD logic duplicated. */
export function AdjustmentsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('nav.adjustments')}</h1>
      <Tabs defaultValue="bonuses">
        <TabsList>
          <TabsTrigger value="bonuses"><TrendingUp className="h-3.5 w-3.5 me-1.5" />{t('nav.bonuses')}</TabsTrigger>
          <TabsTrigger value="deductions"><TrendingDown className="h-3.5 w-3.5 me-1.5" />{t('nav.deductions')}</TabsTrigger>
        </TabsList>
        <TabsContent value="bonuses" className="mt-4">
          <BonusesPage />
        </TabsContent>
        <TabsContent value="deductions" className="mt-4">
          <DeductionsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
