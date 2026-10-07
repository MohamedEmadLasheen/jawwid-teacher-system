import { createRoot } from 'react-dom/client';
import '@/index.css';
import i18n from '@/i18n';

import { ActionCenterPage } from '@/features/action-center/ActionCenterPage';
import { useTeacherStore } from '@/store/teacherStore';
import { useAuthStore } from '@/store/authStore';
import { EVALUATION_CRITERION_KEYS, emptyCriteria, setCriterion } from '@/lib/evaluationCriteria';
import type { Teacher, SessionEvaluation, User } from '@/lib/types';

/**
 * The REAL Action Center — the page that creates and lists teacher
 * evaluations — mounted against the project's real Tailwind build, with the
 * stores seeded from fixtures and `@/lib/supabase` aliased to a recording
 * stub (see vite.config.ts).
 *
 * Nothing about the feature is re-implemented here: the dialog, the
 * searchable teacher selector, the nine criteria, the per-criterion comment
 * fields, the general comment, the save path and the list row are all
 * production code.
 *
 *   ?dir=ltr|rtl   direction, applied to <html> exactly as the app does
 *
 * The roster deliberately mixes Arabic and English names, includes the
 * spellings the data actually carries (hamza-alef, trailing spaces) and two
 * teachers who share a given name and two who share a surname — so partial
 * search has something real to disambiguate. It is long enough that an
 * unsearchable dropdown would be unusable, which is the condition this
 * feature exists to fix.
 */
const params = new URLSearchParams(window.location.search);
const DIR = (params.get('dir') === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');
document.documentElement.dir = DIR;
document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';

const teacher = (id: string, fullName: string): Teacher => ({
  id,
  fullName,
  phone: '', email: '', nationality: '', joiningDate: '2024-01-01',
  monthlySalary: 0, salaryCurrency: 'EGP', salaryType: 'fixed',
  teachingMarket: 'arab', specializations: [], status: 'active',
  level: 'silver', teacherType: 'shift', notes: '',
  isDeleted: false, createdAt: '2024-01-01', updatedAt: '2024-01-01',
});

const TEACHERS: Teacher[] = [
  teacher('t-mohamed-hussein', 'محمد حسين'),
  teacher('t-mohamed-abdullah', 'محمد عبد الله'),
  teacher('t-hussein-ahmed', 'حسين أحمد'),
  teacher('t-aya', 'آية مصطفى'),
  teacher('t-arwa', 'Arwa Ahmed '),
  teacher('t-ashraf', 'Ashraf Elzohdy'),
  teacher('t-menna-ramadan', 'Menna Ramadan'),
  teacher('t-rokaya-ramadan', 'Rokaya Ramadan'),
  teacher('t-hend', 'Hend Mohammed '),
  teacher('t-doaa', 'Doaa Zakaria '),
];

/**
 * A HISTORICAL evaluation: created before the nine criteria existed, so its
 * `criteria` is null and it carries no general comment. The backward
 * compatibility tests assert this row still renders, keeps its original score
 * and grade, and grows no invented comment.
 */
const HISTORICAL: SessionEvaluation = {
  id: 'ev-historical',
  teacherId: 't-ashraf',
  evaluatorId: 'u-1',
  evaluatorName: 'Fatma Quality',
  sessionDate: '2025-03-04',
  tajweedAccuracy: 'excellent', pronunciation: 'good', correctionQuality: 'good',
  listeningSkills: 'excellent', punctuality: 'acceptable', timeManagement: 'good',
  studentEngagement: 'good', classFlow: 'good', professionalism: 'excellent',
  clarity: 'good', encouragement: 'acceptable', parentCommunication: 'good',
  lessonPreparation: 'good', explanationQuality: 'excellent',
  errorCorrection: 'good', followUp: 'acceptable',
  behavioralObservation: 'good',
  quickNotes: [],
  customNote: '',
  criteria: null,
  overallScore: 83,
  grade: 'good',
  createdAt: '2025-03-04T09:00:00.000Z',
};

/**
 * A historical evaluation that DOES have a general comment — custom_note has
 * existed since the first migration, so some old rows already carry one. It
 * must display under the teacher's name like any other.
 */
const HISTORICAL_WITH_NOTE: SessionEvaluation = {
  ...HISTORICAL,
  id: 'ev-historical-note',
  teacherId: 't-doaa',
  sessionDate: '2025-03-01',
  customNote: 'Legacy note kept from the old form.',
  overallScore: 61,
  grade: 'average',
  createdAt: '2025-03-01T09:00:00.000Z',
};

/** A 9-criteria evaluation, as the new form saves one. */
const NINE_CRITERIA: SessionEvaluation = {
  ...HISTORICAL,
  id: 'ev-nine',
  teacherId: 't-mohamed-hussein',
  sessionDate: '2025-10-01',
  customNote: 'Overall, the lesson was good. The teacher handled the student well, but should focus more on correcting pronunciation mistakes.',
  criteria: setCriterion(
    setCriterion(emptyCriteria(), 'studentEngagement', {
      score: 'acceptable',
      comment: 'Student was engaged for most of the lesson, but attention dropped during the final 10 minutes.',
    }),
    'punctuality',
    { score: 'needs_improvement', comment: 'Joined four minutes late.' }
  ),
  overallScore: 70,
  grade: 'good',
  createdAt: '2025-10-01T09:00:00.000Z',
};

/**
 * A 9-criteria evaluation with a DISTINCT score and a DISTINCT comment on
 * every one of the nine — the fixture the read-back tests need to prove that
 * nine comments land on nine criteria and none bleeds into another.
 */
const ALL_NINE: SessionEvaluation = {
  ...HISTORICAL,
  id: 'ev-all-nine',
  teacherId: 't-arwa',
  sessionDate: '2025-10-02',
  customNote: 'Strong lesson overall.',
  criteria: EVALUATION_CRITERION_KEYS.reduce(
    (acc, key, i) => setCriterion(acc, key, {
      score: (['excellent', 'good', 'acceptable', 'needs_improvement'] as const)[i % 4],
      comment: `Observation for criterion ${i + 1}.`,
    }),
    emptyCriteria()
  ),
  overallScore: 70,
  grade: 'good',
  createdAt: '2025-10-01T09:00:00.000Z',
};

const USER: User = {
  id: 'u-1',
  name: DIR === 'rtl' ? 'فاطمة' : 'Fatma Quality',
  email: 'quality@example.test',
  role: 'super_admin',
  permissions: [],
  lockedPermissions: [],
  isActive: true,
} as User;

useAuthStore.setState({ currentUser: USER, isAuthenticated: true });
useTeacherStore.setState({
  teachers: TEACHERS,
  evaluations: [NINE_CRITERIA, ALL_NINE, HISTORICAL, HISTORICAL_WITH_NOTE],
  complaints: [], improvementPlans: [], recommendations: [], adminNotes: [],
  deductions: [], bonuses: [], salaryRecords: [], loading: false, error: null,
});

createRoot(document.getElementById('root')!).render(<ActionCenterPage />);
