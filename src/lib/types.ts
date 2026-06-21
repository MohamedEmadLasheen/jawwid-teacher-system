export type UserRole = 'super_admin' | 'admin' | 'operation_admin' | 'quality_admin';

export type TeacherLevel = 'silver' | 'gold' | 'platinum';
export type TeacherStatus = 'active' | 'inactive';
export type RiskLevel = 'low' | 'medium' | 'high';
export type SalaryCurrency = 'EGP' | 'USD';
export type SalaryType = 'fixed' | 'hourly' | 'hybrid';
export type TeachingMarket = 'arab' | 'non_arab' | 'both';
export type PerformanceCategory = 'elite' | 'excellent' | 'good' | 'needs_improvement' | 'at_risk';

export type Specialization =
  | 'quran'
  | 'arabic_language'
  | 'islamic_studies'
  | 'tajweed'
  | 'noor_al_bayan'
  | 'adults_quran'
  | 'adults_arabic'
  | 'english_language';

export type Permission =
  | 'create_admin'
  | 'edit_admin'
  | 'disable_admin'
  | 'create_supervisor'
  | 'edit_supervisor'
  | 'delete_supervisor'
  | 'manage_roles'
  | 'manage_permissions'
  | 'view_all_data'
  | 'export_data'
  | 'delete_records'
  | 'restore_records'
  | 'view_audit_logs'
  | 'system_settings'
  | 'security_settings'
  | 'manage_teachers'
  | 'view_reports'
  | 'view_evaluations'
  | 'manage_supervisors'
  | 'teacher_onboarding'
  | 'teacher_followup'
  | 'operational_notes'
  | 'teacher_evaluations'
  | 'quality_monitoring'
  | 'performance_reviews'
  | 'manage_complaints'
  | 'improvement_plans';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  department?: string;
  role: UserRole;
  permissions: Permission[];
  /** Permissions locked by Super Admin — cannot be toggled by anyone below Super Admin */
  lockedPermissions?: Permission[];
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  lastPasswordChange?: string;
  avatarInitials?: string;
}

export interface Teacher {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  nationality: string;
  joiningDate: string;
  monthlySalary: number;
  salaryCurrency: SalaryCurrency;
  salaryType: SalaryType;
  teachingMarket: TeachingMarket;
  specializations: Specialization[];
  status: TeacherStatus;
  level: TeacherLevel;
  notes: string;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryRecord {
  id: string;
  teacherId: string;
  month: string;
  baseSalary: number;
  currency: SalaryCurrency;
  bonus: number;
  deduction: number;
  commission: number;
  net: number;
  notes: string;
  createdAt: string;
}

export type EvaluationGrade = 'excellent' | 'good' | 'average' | 'weak' | 'critical';
export type QuickRating = 'excellent' | 'good' | 'acceptable' | 'needs_improvement';

export interface SessionEvaluation {
  id: string;
  teacherId: string;
  evaluatorId: string;
  evaluatorName: string;
  sessionDate: string;
  tajweedAccuracy: QuickRating;
  pronunciation: QuickRating;
  correctionQuality: QuickRating;
  listeningSkills: QuickRating;
  punctuality: QuickRating;
  timeManagement: QuickRating;
  studentEngagement: QuickRating;
  classFlow: QuickRating;
  professionalism: QuickRating;
  clarity: QuickRating;
  encouragement: QuickRating;
  parentCommunication: QuickRating;
  lessonPreparation: QuickRating;
  explanationQuality: QuickRating;
  errorCorrection: QuickRating;
  followUp: QuickRating;
  behavioralObservation: 'excellent' | 'good' | 'needs_improvement' | 'critical_issue';
  quickNotes: string[];
  customNote: string;
  overallScore: number;
  grade: EvaluationGrade;
  createdAt: string;
}

export type ComplaintStatus = 'open' | 'under_review' | 'resolved' | 'closed';
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ComplaintAction {
  id: string;
  status: ComplaintStatus;
  note: string;
  byUser: string;
  timestamp: string;
}

export interface Complaint {
  id: string;
  teacherId: string;
  reportedBy: string;
  description: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  assignedSupervisor?: string;
  resolutionNotes?: string;
  resolutionDate?: string;
  actions: ComplaintAction[];
  createdAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

export type ImprovementPlanStatus = 'open' | 'in_progress' | 'completed' | 'failed';

export interface ImprovementPlan {
  id: string;
  teacherId: string;
  createdBy: string;
  issue: string;
  goal: string;
  actionSteps: string;
  targetDate: string;
  followUpDate: string;
  followUpPercentage: number;
  status: ImprovementPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export type DeductionCategory =
  | 'absence'
  | 'late_attendance'
  | 'policy_violation'
  | 'complaint_penalty'
  | 'admin_violation';

export interface Deduction {
  id: string;
  teacherId: string;
  date: string;
  category: DeductionCategory;
  currency: SalaryCurrency;
  amount: number;
  percentage: number;
  reason: string;
  supervisorName: string;
  notes: string;
  createdAt: string;
}

export type BonusCategory =
  | 'outstanding_evaluation'
  | 'attendance_excellence'
  | 'student_retention'
  | 'admin_excellence'
  | 'special_achievement';

export interface Bonus {
  id: string;
  teacherId: string;
  date: string;
  category: BonusCategory;
  currency: SalaryCurrency;
  amount: number;
  percentage: number;
  reason: string;
  supervisorName: string;
  notes: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export type RecommendationCategory =
  | 'promotion'
  | 'warning'
  | 'training'
  | 'reward'
  | 'performance_followup';

export type RecommendationStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface AdminRecommendation {
  id: string;
  teacherId: string;
  createdBy: string;
  category: RecommendationCategory;
  content: string;
  status: RecommendationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNote {
  id: string;
  teacherId: string;
  createdBy: string;
  content: string;
  createdAt: string;
}

export interface Supervisor {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  status: 'active' | 'inactive';
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  target: string;
  details: string;
  beforeValue?: string;
  afterValue?: string;
  timestamp: string;
}

export interface TeacherRiskProfile {
  riskLevel: RiskLevel;
  riskScore: number;
  factors: {
    complaints: number;
    avgEvalScore: number;
    openPlans: number;
    recentDeductions: number;
  };
}

export interface MonthlyPerformance {
  score: number;
  category: PerformanceCategory;
  breakdown: {
    evaluations: number;
    attendance: number;
    complaints: number;
    adminCompliance: number;
    improvementPlans: number;
  };
}

export type NotificationType = 'success' | 'warning' | 'critical' | 'info';

export interface AppNotification {
  id: string;
  type: NotificationType;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export interface TeacherTimelineEvent {
  id: string;
  teacherId: string;
  date: string;
  eventType:
    | 'hired'
    | 'evaluation'
    | 'bonus'
    | 'deduction'
    | 'complaint_submitted'
    | 'complaint_resolved'
    | 'plan_created'
    | 'plan_closed'
    | 'recommendation'
    | 'note';
  titleAr: string;
  titleEn: string;
  score?: number;
  amount?: number;
  currency?: SalaryCurrency;
}