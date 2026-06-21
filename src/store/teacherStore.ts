import { create } from 'zustand';
import type {
  Teacher, SalaryRecord, SessionEvaluation, Complaint, ComplaintStatus,
  ImprovementPlan, ImprovementPlanStatus, Deduction, Bonus,
  AdminRecommendation, RecommendationStatus, AdminNote, SalaryCurrency,
  BonusCategory, DeductionCategory,
} from '../lib/types';
import * as teacherSvc from '../services/teachers.service';
import * as evalSvc from '../services/evaluations.service';
import * as complaintSvc from '../services/complaints.service';
import * as planSvc from '../services/plans.service';
import * as deductionSvc from '../services/deductions.service';
import * as bonusSvc from '../services/bonuses.service';
import * as recSvc from '../services/recommendations.service';
import * as salarySvc from '../services/salary.service';

interface TeacherState {
  teachers: Teacher[];
  salaryRecords: SalaryRecord[];
  evaluations: SessionEvaluation[];
  complaints: Complaint[];
  improvementPlans: ImprovementPlan[];
  deductions: Deduction[];
  bonuses: Bonus[];
  recommendations: AdminRecommendation[];
  adminNotes: AdminNote[];
  loading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;

  addTeacher: (teacher: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => Promise<void>;
  updateTeacher: (id: string, updates: Partial<Teacher>) => Promise<void>;
  softDeleteTeacher: (id: string) => Promise<void>;
  restoreTeacher: (id: string) => Promise<void>;

  addEvaluation: (evaluation: Omit<SessionEvaluation, 'id' | 'createdAt'>) => Promise<void>;

  addComplaint: (complaint: Omit<Complaint, 'id' | 'createdAt' | 'actions'>) => Promise<void>;
  advanceComplaintStatus: (id: string, newStatus: ComplaintStatus, note: string, byUser: string) => Promise<void>;

  addImprovementPlan: (plan: Omit<ImprovementPlan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateImprovementPlan: (id: string, updates: Partial<ImprovementPlan>) => Promise<void>;

  addDeduction: (deduction: Omit<Deduction, 'id' | 'createdAt'>) => Promise<void>;
  deleteDeduction: (id: string) => Promise<void>;

  addBonus: (bonus: Omit<Bonus, 'id' | 'createdAt'>) => Promise<void>;
  updateBonusApproval: (id: string, status: 'approved' | 'rejected') => Promise<void>;
  deleteBonus: (id: string) => Promise<void>;

  addRecommendation: (rec: Omit<AdminRecommendation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateRecommendationStatus: (id: string, status: RecommendationStatus) => Promise<void>;

  addAdminNote: (note: Omit<AdminNote, 'id' | 'createdAt'>) => Promise<void>;

  addSalaryRecord: (record: Omit<SalaryRecord, 'id' | 'createdAt'>) => Promise<void>;
}

export const useTeacherStore = create<TeacherState>()((set, get) => ({
  teachers: [],
  salaryRecords: [],
  evaluations: [],
  complaints: [],
  improvementPlans: [],
  deductions: [],
  bonuses: [],
  recommendations: [],
  adminNotes: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [teachers, evaluations, complaints, improvementPlans, deductions, bonuses, recommendations, adminNotes, salaryRecords] =
        await Promise.all([
          teacherSvc.fetchTeachers(),
          evalSvc.fetchEvaluations(),
          complaintSvc.fetchComplaints(),
          planSvc.fetchPlans(),
          deductionSvc.fetchDeductions(),
          bonusSvc.fetchBonuses(),
          recSvc.fetchRecommendations(),
          recSvc.fetchAdminNotes(),
          salarySvc.fetchSalaryRecords(),
        ]);
      set({ teachers, evaluations, complaints, improvementPlans, deductions, bonuses, recommendations, adminNotes, salaryRecords, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load data', loading: false });
    }
  },

  addTeacher: async (teacher) => {
    const newTeacher = await teacherSvc.createTeacher(teacher);
    set((state) => ({ teachers: [newTeacher, ...state.teachers] }));
  },

  updateTeacher: async (id, updates) => {
    const updated = await teacherSvc.updateTeacher(id, updates);
    set((state) => ({
      teachers: state.teachers.map((t) => (t.id === id ? updated : t)),
    }));
  },

  softDeleteTeacher: async (id) => {
    await teacherSvc.softDeleteTeacher(id);
    const now = new Date().toISOString();
    set((state) => ({
      teachers: state.teachers.map((t) =>
        t.id === id ? { ...t, isDeleted: true, deletedAt: now, updatedAt: now } : t
      ),
    }));
  },

  restoreTeacher: async (id) => {
    await teacherSvc.restoreTeacher(id);
    const now = new Date().toISOString();
    set((state) => ({
      teachers: state.teachers.map((t) =>
        t.id === id ? { ...t, isDeleted: false, deletedAt: undefined, updatedAt: now } : t
      ),
    }));
  },

  addEvaluation: async (evaluation) => {
    const newEval = await evalSvc.createEvaluation(evaluation);
    set((state) => ({ evaluations: [newEval, ...state.evaluations] }));
  },

  addComplaint: async (complaint) => {
    const newComplaint = await complaintSvc.createComplaint(complaint);
    set((state) => ({ complaints: [newComplaint, ...state.complaints] }));
  },

  advanceComplaintStatus: async (id, newStatus, note, byUser) => {
    const { complaint: patch, action } = await complaintSvc.advanceComplaintStatus(id, newStatus, note, byUser);
    set((state) => ({
      complaints: state.complaints.map((c) => {
        if (c.id !== id) return c;
        return { ...c, ...patch, actions: [...c.actions, action] };
      }),
    }));
  },

  addImprovementPlan: async (plan) => {
    const newPlan = await planSvc.createPlan(plan);
    set((state) => ({ improvementPlans: [newPlan, ...state.improvementPlans] }));
  },

  updateImprovementPlan: async (id, updates) => {
    const updated = await planSvc.updatePlan(id, updates);
    set((state) => ({
      improvementPlans: state.improvementPlans.map((p) => (p.id === id ? updated : p)),
    }));
  },

  addDeduction: async (deduction) => {
    const newDeduction = await deductionSvc.createDeduction(deduction);
    set((state) => ({ deductions: [newDeduction, ...state.deductions] }));
  },

  deleteDeduction: async (id) => {
    await deductionSvc.deleteDeduction(id);
    set((state) => ({ deductions: state.deductions.filter((d) => d.id !== id) }));
  },

  addBonus: async (bonus) => {
    const newBonus = await bonusSvc.createBonus(bonus);
    set((state) => ({ bonuses: [newBonus, ...state.bonuses] }));
  },

  updateBonusApproval: async (id, status) => {
    await bonusSvc.updateBonusApproval(id, status);
    set((state) => ({
      bonuses: state.bonuses.map((b) => (b.id === id ? { ...b, approvalStatus: status } : b)),
    }));
  },

  deleteBonus: async (id) => {
    await bonusSvc.deleteBonus(id);
    set((state) => ({ bonuses: state.bonuses.filter((b) => b.id !== id) }));
  },

  addRecommendation: async (rec) => {
    const newRec = await recSvc.createRecommendation(rec);
    set((state) => ({ recommendations: [newRec, ...state.recommendations] }));
  },

  updateRecommendationStatus: async (id, status) => {
    await recSvc.updateRecommendationStatus(id, status);
    set((state) => ({
      recommendations: state.recommendations.map((r) =>
        r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r
      ),
    }));
  },

  addAdminNote: async (note) => {
    const newNote = await recSvc.createAdminNote(note);
    set((state) => ({ adminNotes: [newNote, ...state.adminNotes] }));
  },

  addSalaryRecord: async (record) => {
    const newRecord = await salarySvc.createSalaryRecord(record);
    set((state) => ({ salaryRecords: [newRecord, ...state.salaryRecords] }));
  },
}));

// ─── Pure computation helpers (unchanged) ────────────────────────────────────

export function computePerformanceScore(
  teacherId: string,
  evaluations: SessionEvaluation[],
  complaints: Complaint[],
  improvementPlans: ImprovementPlan[],
  deductions: Deduction[]
): { score: number; category: string } {
  const teacherEvals = evaluations.filter((e) => e.teacherId === teacherId);
  const teacherComplaints = complaints.filter((c) => c.teacherId === teacherId && c.status !== 'closed');
  const openPlans = improvementPlans.filter((p) => p.teacherId === teacherId && (p.status === 'open' || p.status === 'in_progress'));
  const recentDeds = deductions.filter((d) => d.teacherId === teacherId);

  const avgEval = teacherEvals.length
    ? teacherEvals.reduce((sum, e) => sum + e.overallScore, 0) / teacherEvals.length
    : 75;

  const evalScore = (avgEval / 100) * 40;
  const attendanceScore = 20;
  const complaintScore = Math.max(0, 15 - teacherComplaints.length * 5);
  const adminScore = Math.max(0, 15 - recentDeds.length * 3);
  const planScore = Math.max(0, 10 - openPlans.length * 5);

  const total = Math.min(100, Math.max(0, Math.round(evalScore + attendanceScore + complaintScore + adminScore + planScore)));

  let category = 'at_risk';
  if (total >= 90) category = 'elite';
  else if (total >= 80) category = 'excellent';
  else if (total >= 70) category = 'good';
  else if (total >= 60) category = 'needs_improvement';

  return { score: total, category };
}

export function computeRiskProfile(
  teacherId: string,
  evaluations: SessionEvaluation[],
  complaints: Complaint[],
  improvementPlans: ImprovementPlan[],
  deductions: Deduction[]
): { riskLevel: 'low' | 'medium' | 'high'; riskScore: number } {
  const teacherComplaints = complaints.filter((c) => c.teacherId === teacherId && c.status !== 'closed');
  const teacherEvals = evaluations.filter((e) => e.teacherId === teacherId);
  const openPlans = improvementPlans.filter((p) => p.teacherId === teacherId && (p.status === 'open' || p.status === 'in_progress'));
  const recentDeds = deductions.filter((d) => d.teacherId === teacherId);

  let score = 0;
  score += teacherComplaints.length * 20;
  score += openPlans.length * 15;
  score += recentDeds.length * 10;
  if (teacherEvals.length > 0) {
    const avg = teacherEvals.reduce((s, e) => s + e.overallScore, 0) / teacherEvals.length;
    if (avg < 60) score += 30;
    else if (avg < 75) score += 15;
  }

  const clamped = Math.min(100, score);
  const riskLevel = clamped >= 60 ? 'high' : clamped >= 30 ? 'medium' : 'low';
  return { riskLevel, riskScore: clamped };
}

export function formatCurrency(amount: number, currency: SalaryCurrency): string {
  if (currency === 'USD') return `$${amount.toLocaleString()}`;
  return `${amount.toLocaleString()} ج.م`;
}

export function getBonusCategoryLabel(cat: BonusCategory, lang: string): string {
  const labels: Record<BonusCategory, { ar: string; en: string }> = {
    outstanding_evaluation: { ar: 'تقييم متميز', en: 'Outstanding Evaluation' },
    attendance_excellence: { ar: 'تميز في الحضور', en: 'Attendance Excellence' },
    student_retention: { ar: 'الاحتفاظ بالطلاب', en: 'Student Retention' },
    admin_excellence: { ar: 'تميز إداري', en: 'Administrative Excellence' },
    special_achievement: { ar: 'إنجاز خاص', en: 'Special Achievement' },
  };
  return lang === 'ar' ? labels[cat].ar : labels[cat].en;
}

export function getDeductionCategoryLabel(cat: DeductionCategory, lang: string): string {
  const labels: Record<DeductionCategory, { ar: string; en: string }> = {
    absence: { ar: 'غياب', en: 'Absence' },
    late_attendance: { ar: 'تأخر في الحضور', en: 'Late Attendance' },
    policy_violation: { ar: 'مخالفة سياسة', en: 'Policy Violation' },
    complaint_penalty: { ar: 'غرامة شكوى', en: 'Complaint Penalty' },
    admin_violation: { ar: 'مخالفة إدارية', en: 'Administrative Violation' },
  };
  return lang === 'ar' ? labels[cat].ar : labels[cat].en;
}

// Keep these type exports for backward compatibility
export type { ImprovementPlanStatus };
