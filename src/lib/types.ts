export type UserRole = 'super_admin' | 'admin' | 'operation_admin' | 'quality_admin' | 'supervisor';

export type TeacherLevel = 'silver' | 'gold' | 'platinum';
export type TeacherStatus = 'active' | 'inactive';
export type RiskLevel = 'low' | 'medium' | 'high';
export type SalaryCurrency = 'EGP' | 'USD';
export type SalaryType = 'fixed' | 'hourly' | 'hybrid';
export type TeachingMarket = 'arab' | 'non_arab' | 'both';
export type TeacherType = 'hourly' | 'shift';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
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
  | 'improvement_plans'
  | 'manage_financials'
  | 'manage_students'
  | 'manage_parents'
  | 'manage_courses'
  | 'manage_session_reports'
  | 'view_session_reports';

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
  /** Hourly: manually set available blocks. Shift: assigned to reusable shift templates. */
  teacherType: TeacherType;
  branchId?: string | null;
  maxWeeklyHours?: number | null;
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
  /** Linked auth user id when the supervisor has a login account. */
  userId?: string | null;
  /** UI-only hex color used to color-code this supervisor's students on the schedule grid. */
  colorHex?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Scheduling Engine — foundational domain (Phase 0) ────────────────────────

export type StudentStatus = 'active' | 'paused' | 'trial' | 'withdrawn';
export type StudentGender = 'male' | 'female';
export type ParentRelationship = 'mother' | 'father' | 'guardian' | 'other';
export type PreferredLanguage = 'ar' | 'en';
/** Reuses the same vocabulary as Teacher.specializations so course→teacher matching is a plain equality join. */
export type CourseCategory = Specialization;

export interface Branch {
  id: string;
  name: string;
  timezone: string;
  country: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Parent {
  id: string;
  branchId?: string | null;
  fullName: string;
  phone: string;
  email: string;
  country: string;
  timezone: string;
  preferredLanguage: PreferredLanguage;
  notes: string;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  branchId?: string | null;
  fullName: string;
  dateOfBirth?: string;
  country: string;
  timezone: string;
  gender?: StudentGender;
  level: string;
  status: StudentStatus;
  enrollmentSource: string;
  /** Operations Supervisor who owns this student — drives the schedule grid's supervisor-based coloring. */
  supervisorId?: string | null;
  /** Student who paused and later resumed — a real attribute, not a name suffix. */
  isReturning: boolean;
  /** The student's primary/assigned course. Null means "Course Pending" in the schedule UI. */
  courseId?: string | null;
  notes: string;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentParent {
  id: string;
  studentId: string;
  parentId: string;
  relationship: ParentRelationship;
  isPrimaryContact: boolean;
  createdAt: string;
}

export interface Course {
  id: string;
  branchId?: string | null;
  nameEn: string;
  nameAr: string;
  category: CourseCategory;
  defaultDurationMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Scheduling Engine — teacher availability & shift model (Phase 1) ─────────

export interface TeacherAvailability {
  id: string;
  teacherId: string;
  dayOfWeek: DayOfWeek;
  startMinute: number;
  endMinute: number;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftTemplate {
  id: string;
  branchId?: string | null;
  name: string;
  startMinute: number;
  endMinute: number;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherShiftAssignment {
  id: string;
  teacherId: string;
  shiftTemplateId: string;
  dayOfWeek: DayOfWeek;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Scheduling Engine — core lesson model (Phase 2) ───────────────────────────

export type LessonLifecycleStatus = 'trial' | 'active' | 'paused' | 'ended';
export type LessonExceptionStatus = 'cancelled' | 'rescheduled' | 'completed' | 'no_show';

export interface Lesson {
  id: string;
  branchId?: string | null;
  teacherId: string;
  /** Null renders as "Course Pending" — never guessed automatically. */
  courseId?: string | null;
  dayOfWeek: DayOfWeek;
  startMinute: number;
  durationMinutes: number;
  endMinute: number;
  timezone: string;
  lifecycleStatus: LessonLifecycleStatus;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  originalTeacherId?: string | null;
  sameDaySince: string;
  sameTimeSince: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LessonParticipant {
  id: string;
  lessonId: string;
  studentId: string;
  createdAt: string;
}

export interface LessonException {
  id: string;
  lessonId: string;
  occurrenceDate: string;
  status: LessonExceptionStatus;
  overrideTeacherId?: string | null;
  overrideStartMinute?: number | null;
  overrideDurationMinutes?: number | null;
  attendanceNotes: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Operations Module (Phase 1: Session Reporting) ──────────────────────────
// First entity in a dedicated Operations domain — see src/services/operations/
// and src/features/operations/. Follow-Ups, Payments, and Notes (future
// phases) each get their own table/type/service here too, not a shared
// generic shape; what's reused across them is the surrounding pattern
// (service/hook conventions, the operationsKeys factory, activity logging),
// not the data model itself.
export type LessonSessionReportStatus = 'delivered' | 'absent_student' | 'excused_family' | 'excused_teacher';
export type SessionPerformanceLevel = 'excellent' | 'very_good' | 'good' | 'acceptable';

export interface LessonSessionReport {
  id: string;
  lessonParticipantId: string;
  occurrenceDate: string;
  status: LessonSessionReportStatus;
  isMakeupSession: boolean;
  /** Set only when a substitute (not the lesson's own teacher_id) delivered this occurrence. */
  deliveredByTeacherId?: string | null;
  performanceLevel?: SessionPerformanceLevel | null;
  sessionNumberInPackage?: number | null;
  contentCovered: string;
  homework: string;
  nextSessionPlan: string;
  /** Required whenever status !== 'delivered' (enforced by a DB CHECK constraint too). */
  reasonNote: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleConflictResult {
  hasConflict: boolean;
  teacherConflict: { lessonId: string; teacherId: string } | null;
  studentConflicts: { studentId: string; lessonId: string }[];
  message: string;
}

export interface TeacherPreservationScore {
  score: number;
  teacherPreserved: boolean;
  dayStableDays: number;
  timeStableDays: number;
  breakdown: { teacher: number; day: number; time: number };
}

export interface ScheduleHealthMetrics {
  teacherOccupancyRate: number;
  totalEmptyHours: number;
  unusedPrimeTimeHours: number;
  primeTimeOccupancyPct: number;
  mostOccupiedTeacher: { teacherId: string; fullName: string; occupancyPct: number } | null;
  leastUtilizedTeacher: { teacherId: string; fullName: string; occupancyPct: number } | null;
  totalAvailableBookableSlots: number;
  teachersAbove95PctCount: number;
  teachersBelow40PctCount: number;
  pausedStudentsSchedulableCount: number;
}

/** One raw row from get_active_schedule_conflicts() — facts/codes only, no translated text. */
export interface ScheduleConflictRow {
  conflictType: 'teacher_double_booking' | 'student_double_booking';
  teacherId: string | null;
  studentId: string | null;
  lessonIdA: string;
  lessonIdB: string;
  dayOfWeek: DayOfWeek;
  startMinuteA: number;
  durationMinutesA: number;
  startMinuteB: number;
  durationMinutesB: number;
}

/** Current + historical primary-teacher fact for a student — separate from
 * whichever teacher_id happens to be on a given lesson (migration 017). */
export interface StudentTeacherAssignment {
  id: string;
  studentId: string;
  teacherId: string;
  startedAt: string;
  endedAt: string | null;
  source: 'confirmed_manual' | 'confirmed_import' | 'inferred_pending_review';
  notes?: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row from get_primary_teacher_inference_report() — evidence/codes only, never
 * a confirmed business fact by itself (see PrimaryTeacherReviewPage for the human-approval step). */
export interface PrimaryTeacherInferenceRow {
  studentId: string;
  studentName: string;
  candidateTeacherId: string | null;
  candidateTeacherName: string | null;
  analyzedLessonCount: number;
  candidateLessonCount: number;
  candidateSharePct: number | null;
  distinctTeacherCount: number;
  mostRecentLessonSince: string | null;
  secondCandidateTeacherId: string | null;
  secondCandidateTeacherName: string | null;
  secondCandidateSharePct: number | null;
  confirmedTeacherId: string | null;
  confirmedTeacherName: string | null;
  confidence: 'high' | 'medium' | 'low' | 'insufficient' | null;
  status: 'confirmed' | 'inferred' | 'needs_review' | 'no_candidate';
  reasonCode: string;
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