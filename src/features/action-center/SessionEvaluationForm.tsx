import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore } from '@/store/teacherStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Zap } from 'lucide-react';
import type { QuickRating, EvaluationGrade, SessionEvaluation } from '@/lib/types';

const QUICK_NOTES_OPTIONS = [
  'outstanding_session', 'good_session', 'weak_engagement',
  'weak_tajweed', 'needs_monitoring', 'parent_followup', 're_evaluation',
];

const COMMENT_LIBRARY = [
  'comment_excellent_interaction',
  'comment_classroom_improvement',
  'comment_parent_communication',
  'comment_attendance_improvement',
  'comment_lesson_preparation',
];

const RATING_OPTIONS: QuickRating[] = ['excellent', 'good', 'acceptable', 'needs_improvement'];

const RATING_COLORS: Record<QuickRating, string> = {
  excellent: 'bg-green-500 text-white border-green-500',
  good: 'bg-blue-500 text-white border-blue-500',
  acceptable: 'bg-yellow-500 text-white border-yellow-500',
  needs_improvement: 'bg-red-500 text-white border-red-500',
};

const RATING_SCORE: Record<QuickRating, number> = {
  excellent: 4,
  good: 3,
  acceptable: 2,
  needs_improvement: 1,
};

type EvalFields = {
  tajweedAccuracy: QuickRating; pronunciation: QuickRating;
  correctionQuality: QuickRating; listeningSkills: QuickRating;
  punctuality: QuickRating; timeManagement: QuickRating;
  studentEngagement: QuickRating; classFlow: QuickRating;
  professionalism: QuickRating; clarity: QuickRating;
  encouragement: QuickRating; parentCommunication: QuickRating;
  lessonPreparation: QuickRating; explanationQuality: QuickRating;
  errorCorrection: QuickRating; followUp: QuickRating;
};

const DEFAULT_RATING: QuickRating = 'good';

const TEMPLATES: Record<string, Partial<EvalFields>> = {
  template_excellent: {
    tajweedAccuracy: 'excellent', pronunciation: 'excellent', correctionQuality: 'excellent', listeningSkills: 'excellent',
    punctuality: 'excellent', timeManagement: 'excellent', studentEngagement: 'excellent', classFlow: 'excellent',
    professionalism: 'excellent', clarity: 'excellent', encouragement: 'excellent', parentCommunication: 'excellent',
    lessonPreparation: 'excellent', explanationQuality: 'excellent', errorCorrection: 'excellent', followUp: 'excellent',
  },
  template_followup: {
    tajweedAccuracy: 'good', pronunciation: 'acceptable', correctionQuality: 'acceptable', listeningSkills: 'good',
    punctuality: 'acceptable', timeManagement: 'needs_improvement', studentEngagement: 'acceptable', classFlow: 'acceptable',
    professionalism: 'good', clarity: 'acceptable', encouragement: 'needs_improvement', parentCommunication: 'acceptable',
    lessonPreparation: 'acceptable', explanationQuality: 'acceptable', errorCorrection: 'needs_improvement', followUp: 'needs_improvement',
  },
  template_attendance: {
    tajweedAccuracy: 'good', pronunciation: 'good', correctionQuality: 'good', listeningSkills: 'good',
    punctuality: 'needs_improvement', timeManagement: 'needs_improvement', studentEngagement: 'acceptable', classFlow: 'acceptable',
    professionalism: 'good', clarity: 'good', encouragement: 'good', parentCommunication: 'acceptable',
    lessonPreparation: 'good', explanationQuality: 'good', errorCorrection: 'good', followUp: 'acceptable',
  },
};

function computeScore(fields: EvalFields, behavioral: string): number {
  const ratingFields = Object.values(fields) as QuickRating[];
  const sum = ratingFields.reduce((s, r) => s + RATING_SCORE[r], 0);
  const max = ratingFields.length * 4;
  const behavioralBonus = behavioral === 'excellent' ? 5 : behavioral === 'good' ? 2 : behavioral === 'needs_improvement' ? -5 : -10;
  return Math.min(100, Math.max(0, Math.round((sum / max) * 90) + behavioralBonus));
}

function getGrade(score: number): EvaluationGrade {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'average';
  if (score >= 45) return 'weak';
  return 'critical';
}

interface Props {
  onClose: () => void;
}

export function SessionEvaluationForm({ onClose }: Props) {
  const { t } = useTranslation();
  const { currentUser } = useAuthStore();
  const { teachers, addEvaluation } = useTeacherStore();

  const [teacherId, setTeacherId] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [behavioral, setBehavioral] = useState<'excellent' | 'good' | 'needs_improvement' | 'critical_issue'>('good');
  const [quickNotes, setQuickNotes] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState('');

  const [fields, setFields] = useState<EvalFields>({
    tajweedAccuracy: DEFAULT_RATING, pronunciation: DEFAULT_RATING,
    correctionQuality: DEFAULT_RATING, listeningSkills: DEFAULT_RATING,
    punctuality: DEFAULT_RATING, timeManagement: DEFAULT_RATING,
    studentEngagement: DEFAULT_RATING, classFlow: DEFAULT_RATING,
    professionalism: DEFAULT_RATING, clarity: DEFAULT_RATING,
    encouragement: DEFAULT_RATING, parentCommunication: DEFAULT_RATING,
    lessonPreparation: DEFAULT_RATING, explanationQuality: DEFAULT_RATING,
    errorCorrection: DEFAULT_RATING, followUp: DEFAULT_RATING,
  });

  const score = computeScore(fields, behavioral);
  const grade = getGrade(score);

  const setField = (key: keyof EvalFields, val: QuickRating) =>
    setFields((prev) => ({ ...prev, [key]: val }));

  const applyTemplate = (templateKey: string) => {
    const tpl = TEMPLATES[templateKey];
    if (tpl) setFields((prev) => ({ ...prev, ...tpl }));
  };

  const toggleNote = (note: string) => {
    setQuickNotes((prev) =>
      prev.includes(note) ? prev.filter((n) => n !== note) : [...prev, note]
    );
  };

  const addComment = (commentKey: string) => {
    const text = t(`evaluation.${commentKey}`);
    setCustomNote((prev) => (prev ? `${prev}\n${text}` : text));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId) return;
    const evalData: Omit<SessionEvaluation, 'id' | 'createdAt'> = {
      teacherId, sessionDate,
      evaluatorId: currentUser?.id ?? '',
      evaluatorName: currentUser?.name ?? '',
      ...fields,
      behavioralObservation: behavioral,
      quickNotes, customNote,
      overallScore: score,
      grade,
    };
    addEvaluation(evalData);
    onClose();
  };

  const gradeColors: Record<EvaluationGrade, string> = {
    excellent: 'bg-green-500',
    good: 'bg-blue-500',
    average: 'bg-yellow-500',
    weak: 'bg-orange-500',
    critical: 'bg-red-500',
  };

  const activeTeachers = teachers.filter((t) => !t.isDeleted && t.status === 'active');

  const sections: { key: string; fields: (keyof EvalFields)[] }[] = [
    { key: 'section1', fields: ['tajweedAccuracy', 'pronunciation', 'correctionQuality', 'listeningSkills'] },
    { key: 'section2', fields: ['punctuality', 'timeManagement', 'studentEngagement', 'classFlow'] },
    { key: 'section3', fields: ['professionalism', 'clarity', 'encouragement', 'parentCommunication'] },
    { key: 'section4', fields: ['lessonPreparation', 'explanationQuality', 'errorCorrection', 'followUp'] },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto pe-1">
      {/* Teacher + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{t('common.teacher')} *</Label>
          <Select value={teacherId} onValueChange={setTeacherId}>
            <SelectTrigger><SelectValue placeholder={t('common.teacher')} /></SelectTrigger>
            <SelectContent>
              {activeTeachers.map((tc) => (
                <SelectItem key={tc.id} value={tc.id}>{tc.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('evaluation.sessionDate')}</Label>
          <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </div>
      </div>

      {/* Live Score */}
      <div className="bg-gray-50 rounded-xl p-4 border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('evaluation.overallScore')}</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary">{score}</span>
            <Badge className={`${gradeColors[grade]} text-white`}>{t(`evaluation.${grade}`)}</Badge>
          </div>
        </div>
        <Progress value={score} className="h-3" />
      </div>

      {/* Quick Templates */}
      <div>
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4 text-secondary" />
          {t('evaluation.quickTemplate')}
        </p>
        <div className="flex gap-2 flex-wrap">
          {['template_excellent', 'template_followup', 'template_attendance'].map((tpl) => (
            <Button
              key={tpl}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyTemplate(tpl)}
              className="text-xs border-secondary text-secondary hover:bg-secondary hover:text-white"
            >
              {t(`evaluation.${tpl}`)}
            </Button>
          ))}
        </div>
      </div>

      {/* Evaluation Sections */}
      {sections.map((section) => (
        <div key={section.key} className="space-y-3">
          <h4 className="text-sm font-semibold text-primary border-b pb-1">
            {t(`evaluation.${section.key}`)}
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {section.fields.map((field) => (
              <div key={field} className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground min-w-[140px]">
                  {t(`evaluation.${field}`)}
                </span>
                <div className="flex gap-1">
                  {RATING_OPTIONS.map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setField(field, rating)}
                      className={`px-2 py-1 rounded text-xs border transition-all ${
                        fields[field] === rating
                          ? RATING_COLORS[rating]
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {t(`evaluation.${rating}`)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Section 5: Behavioral */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-primary border-b pb-1">
          {t('evaluation.section5')}
        </h4>
        <div className="flex gap-2 flex-wrap">
          {(['excellent', 'good', 'needs_improvement', 'critical_issue'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setBehavioral(opt)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                behavioral === opt
                  ? opt === 'excellent' ? 'bg-green-500 text-white border-green-500'
                    : opt === 'good' ? 'bg-blue-500 text-white border-blue-500'
                    : opt === 'needs_improvement' ? 'bg-yellow-500 text-white border-yellow-500'
                    : 'bg-red-500 text-white border-red-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {t(`evaluation.behavioral${opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Section 6: Quick Notes */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-primary border-b pb-1">
          {t('evaluation.section6')}
        </h4>
        <div className="flex flex-wrap gap-2">
          {QUICK_NOTES_OPTIONS.map((note) => (
            <button
              key={note}
              type="button"
              onClick={() => toggleNote(note)}
              className={`px-2 py-1 rounded-full text-xs border transition-all ${
                quickNotes.includes(note)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
              }`}
            >
              {t(`evaluation.${note}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Comments Library */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('evaluation.commentsLibrary')}</p>
        <div className="flex flex-wrap gap-2">
          {COMMENT_LIBRARY.map((ck) => (
            <button
              key={ck}
              type="button"
              onClick={() => addComment(ck)}
              className="px-2 py-1 rounded text-xs border bg-white text-gray-600 border-gray-300 hover:border-secondary hover:text-secondary transition-all"
            >
              + {t(`evaluation.${ck}`)}
            </button>
          ))}
        </div>
        <Textarea
          value={customNote}
          onChange={(e) => setCustomNote(e.target.value)}
          placeholder={t('common.notes')}
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={!teacherId}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {t('common.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

