import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Trash2, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useDemoModeActive, useGenerateDemoAcademy, useDeleteDemoAcademy } from './useDemoAcademy';
import type { DemoCategoryKey } from '@/services/demoData.service';

const CATEGORY_LABELS: Record<DemoCategoryKey, { en: string; ar: string }> = {
  foundation: { en: 'Foundation (supervisors, courses, parents)', ar: 'الأساس (المشرفون، المواد، أولياء الأمور)' },
  teachers: { en: 'Teachers', ar: 'المعلمون' },
  students: { en: 'Students', ar: 'الطلاب' },
  lessons: { en: 'Lessons', ar: 'الحصص' },
  history: { en: 'History (completed/cancelled/rescheduled)', ar: 'السجل (مكتملة/ملغاة/معاد جدولتها)' },
  quality: { en: 'Quality data (evaluations, complaints...)', ar: 'بيانات الجودة (تقييمات، شكاوى...)' },
};

export function DemoDataTab() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { data: isActive, isLoading } = useDemoModeActive();
  const generate = useGenerateDemoAcademy();
  const del = useDeleteDemoAcademy();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isGenerating = generate.status === 'running';
  const showProgress = generate.status !== 'idle';

  return (
    <div className="space-y-6 max-w-2xl">
      {isActive && (
        <Alert className="border-amber-400 bg-amber-50">
          <AlertDescription className="flex items-center gap-2 text-amber-700">
            <FlaskConical className="h-4 w-4" />
            {isAr ? 'بيانات الأكاديمية التجريبية نشطة حالياً.' : 'Demo Academy data is currently active.'}
          </AlertDescription>
        </Alert>
      )}

      {generate.status === 'done' && (
        <Alert className="border-green-400 bg-green-50">
          <AlertDescription className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            {isAr ? 'تم إنشاء الأكاديمية التجريبية بنجاح.' : 'Demo Academy generated successfully.'}
          </AlertDescription>
        </Alert>
      )}
      {del.isSuccess && (
        <Alert className="border-green-400 bg-green-50">
          <AlertDescription className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            {isAr ? 'تم حذف جميع بيانات الأكاديمية التجريبية.' : 'All Demo Academy data has been deleted.'}
          </AlertDescription>
        </Alert>
      )}
      {del.error && (
        <Alert className="border-red-400 bg-red-50">
          <AlertDescription className="text-red-700">{del.error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-primary flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            {isAr ? 'إنشاء الأكاديمية التجريبية' : 'Generate Demo Academy'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'ينشئ معلمين وطلاب وأولياء أمور ومواد وحصصاً تجريبية واقعية على دفعات صغيرة آمنة (بدون تجميد الواجهة). كل سجل يُعلَّم كـ is_demo = true ولا يمس أي بيانات حقيقية.'
              : 'Creates realistic demo teachers, students, parents, courses, and lessons in small safe batches (no UI freeze). Every record is tagged is_demo = true and never touches real data.'}
          </p>

          {!showProgress && (
            <Button onClick={generate.start} disabled={isLoading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <FlaskConical className="h-4 w-4 me-2" />
              {isAr ? 'إنشاء الأكاديمية التجريبية' : 'Generate Demo Academy'}
            </Button>
          )}

          {showProgress && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span>{isGenerating ? (isAr ? 'جاري الإنشاء...' : 'Generating Demo Academy...') : generate.status === 'error' ? (isAr ? 'توقف — حدث خطأ' : 'Stopped — an error occurred') : (isAr ? 'اكتمل' : 'Complete')}</span>
                <span>{generate.overallPct}%</span>
              </div>
              <Progress value={generate.overallPct} className="h-2" />

              <div className="space-y-1.5">
                {(Object.keys(generate.categories) as DemoCategoryKey[]).map((key) => {
                  const c = generate.categories[key];
                  const done = c.current >= c.total;
                  return (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{isAr ? CATEGORY_LABELS[key].ar : CATEGORY_LABELS[key].en}</span>
                      <span className={done ? 'text-green-600 font-medium' : 'font-medium'}>
                        {c.current.toLocaleString()} / {c.total.toLocaleString()} {done && '✓'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {generate.status === 'error' && (
                <div className="space-y-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      {isAr ? `فشلت المرحلة "${generate.failedStageKey}": ` : `Stage "${generate.failedStageKey}" failed: `}
                      {generate.error}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={generate.retry}>
                      <RotateCcw className="h-3.5 w-3.5 me-1" />
                      {isAr ? 'إعادة المحاولة من هذه المرحلة' : 'Retry from this stage'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={generate.start}>
                      {isAr ? 'البدء من جديد' : 'Restart from scratch'}
                    </Button>
                  </div>
                </div>
              )}

              {generate.status === 'done' && (
                <Button size="sm" variant="outline" onClick={generate.start}>
                  <FlaskConical className="h-3.5 w-3.5 me-1" />
                  {isAr ? 'إعادة الإنشاء' : 'Re-generate'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-red-600 flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            {isAr ? 'حذف الأكاديمية التجريبية' : 'Delete Demo Academy'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'يحذف كل سجل تم تعليمه is_demo = true فقط. لا يمس أي بيانات حقيقية إطلاقاً.'
              : 'Removes only records tagged is_demo = true. Never touches any real production data.'}
          </p>
          {!confirmingDelete ? (
            <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="h-4 w-4 me-2" />
              {isAr ? 'حذف الأكاديمية التجريبية' : 'Delete Demo Academy'}
            </Button>
          ) : (
            <div className="space-y-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-700 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {isAr ? 'هل أنت متأكد؟ سيتم حذف جميع بيانات الأكاديمية التجريبية بشكل نهائي.' : 'Are you sure? This permanently deletes all Demo Academy data.'}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={del.isPending}
                  onClick={() => { del.mutate(); setConfirmingDelete(false); }}
                >
                  {del.isPending ? (isAr ? 'جاري الحذف...' : 'Deleting...') : (isAr ? 'نعم، احذف' : 'Yes, Delete')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
