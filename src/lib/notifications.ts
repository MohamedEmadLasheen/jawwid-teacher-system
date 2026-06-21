import type {
  AppNotification, Teacher, Bonus, Complaint, ImprovementPlan,
  SessionEvaluation, Deduction,
} from './types';
import { computeRiskProfile } from '@/store/teacherStore';

interface BuildArgs {
  teachers: Teacher[];
  bonuses: Bonus[];
  complaints: Complaint[];
  improvementPlans: ImprovementPlan[];
  evaluations: SessionEvaluation[];
  deductions: Deduction[];
}

/** A generated notification before per-user read state is applied. */
type RawNotification = Omit<AppNotification, 'isRead'>;

/**
 * Derives real notifications from current domain data. IDs are stable
 * (tied to the underlying record) so read/dismissed state persists across
 * reloads. Replaces the old hardcoded SAMPLE_NOTIFICATIONS.
 */
export function buildNotifications({
  teachers, bonuses, complaints, improvementPlans, evaluations, deductions,
}: BuildArgs): RawNotification[] {
  const out: RawNotification[] = [];
  const activeTeachers = teachers.filter((t) => !t.isDeleted);
  const nameOf = (id: string) => teachers.find((t) => t.id === id)?.fullName ?? '';

  // 1. High-risk teachers
  for (const teacher of activeTeachers) {
    const { riskLevel } = computeRiskProfile(teacher.id, evaluations, complaints, improvementPlans, deductions);
    if (riskLevel === 'high') {
      out.push({
        id: `risk-${teacher.id}`,
        type: 'critical',
        titleAr: 'معلم في خطر',
        titleEn: 'Teacher At Risk',
        messageAr: `المعلم ${teacher.fullName} مصنّف ضمن الخطر المرتفع`,
        messageEn: `${teacher.fullName} is classified as high risk`,
        createdAt: teacher.updatedAt ?? teacher.createdAt,
        link: `/teachers/${teacher.id}`,
      });
    }
  }

  // 2. Bonuses awaiting approval
  for (const bonus of bonuses.filter((b) => b.approvalStatus === 'pending')) {
    out.push({
      id: `bonus-${bonus.id}`,
      type: 'success',
      titleAr: 'مكافأة بانتظار الموافقة',
      titleEn: 'Bonus Awaiting Approval',
      messageAr: `مكافأة للمعلم ${nameOf(bonus.teacherId)} تنتظر الموافقة`,
      messageEn: `A bonus for ${nameOf(bonus.teacherId)} awaits approval`,
      createdAt: bonus.createdAt,
      link: '/bonuses',
    });
  }

  // 3. Open / under-review complaints
  for (const complaint of complaints.filter((c) => c.status === 'open' || c.status === 'under_review')) {
    out.push({
      id: `complaint-${complaint.id}`,
      type: 'warning',
      titleAr: 'شكوى مفتوحة',
      titleEn: 'Open Complaint',
      messageAr: `شكوى بخصوص المعلم ${nameOf(complaint.teacherId)} بحاجة للمتابعة`,
      messageEn: `A complaint about ${nameOf(complaint.teacherId)} needs follow-up`,
      createdAt: complaint.createdAt,
      link: '/action-center',
    });
  }

  // 4. Overdue improvement plans (target date passed, still open/in-progress)
  const today = new Date().toISOString().split('T')[0];
  for (const plan of improvementPlans) {
    const isOpen = plan.status === 'open' || plan.status === 'in_progress';
    if (isOpen && plan.targetDate && plan.targetDate < today) {
      out.push({
        id: `plan-${plan.id}`,
        type: 'warning',
        titleAr: 'خطة تحسين متأخرة',
        titleEn: 'Improvement Plan Overdue',
        messageAr: `خطة تحسين للمعلم ${nameOf(plan.teacherId)} تجاوزت تاريخها المستهدف`,
        messageEn: `An improvement plan for ${nameOf(plan.teacherId)} is past its target date`,
        createdAt: plan.createdAt,
        link: '/action-center',
      });
    }
  }

  // Newest first
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
