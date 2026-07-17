import { PRIME_TIME_START_MINUTE, PRIME_TIME_END_MINUTE, DAYS_OF_WEEK } from '../constants/schedulingConstants';
import { computeLessonPreservationScore } from './lessonPreservation';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { UnifiedAvailabilitySlot } from '@/services/scheduling/teacherAvailability.service';
import type { LessonExceptionRecord } from '@/services/scheduling/lessons.service';
import type { Teacher, Student, Course } from '@/lib/types';

const primeOverlapMinutes = (start: number, dur: number) =>
  Math.max(0, Math.min(start + dur, PRIME_TIME_END_MINUTE) - Math.max(start, PRIME_TIME_START_MINUTE));

export type WorkloadStatus = 'very_light' | 'balanced' | 'busy' | 'overloaded' | 'critical';

function workloadStatusFor(occupancyPct: number): WorkloadStatus {
  if (occupancyPct > 95) return 'critical';
  if (occupancyPct > 85) return 'overloaded';
  if (occupancyPct > 60) return 'busy';
  if (occupancyPct > 20) return 'balanced';
  return 'very_light';
}

export interface TeacherIntelligenceRow {
  teacherId: string;
  teacherName: string;
  teacherType: string;
  courseTypes: string[];
  todayHours: number; todayLessons: number;
  weeklyHours: number; weeklyLessons: number;
  monthlyHours: number; monthlyLessons: number;
  primeTimeHours: number; primeTimeOccupancyPct: number;
  totalOccupancyPct: number;
  availableHours: number; emptyHours: number; sellableHours: number;
  studentsCount: number; groupsCount: number; oneToOneCount: number;
  currentCapacityLessons: number; remainingCapacitySlots: number;
  preservationPct: number;
  workloadStatus: WorkloadStatus;
  cancelledLessons: number; completedLessons: number;
}

export interface AcademyHealthResult {
  overview: {
    teacherOccupancyRate: number; primeTimeOccupancyPct: number; unusedPrimeTimeHours: number;
    totalEmptyHours: number; sellableEmptyHours: number; availableBookableSlots: number;
    weeklyCapacityHours: number; monthlyCapacityHours: number;
    lessonsToday: number; lessonsWeekly: number; lessonsMonthly: number;
    activeStudents: number; activeTeachers: number;
    avgLessonsPerTeacher: number; avgLessonsPerStudent: number;
    /** False when no teacher_availability/shift rows exist at all — occupancy/capacity
     * metrics below are then meaningless zeros, not real "0% occupied" facts. */
    hasAvailabilityData: boolean;
  };
  distribution: { overloaded: number; balanced: number; underutilized: number; zeroLessons: number; noPrimeTime: number; unusedAvailability: number };
  primeTime: {
    capacityHours: number; usedHours: number; emptyHours: number; sellableHours: number; occupancyPct: number;
    busiestDay: string | null; quietestDay: string | null; busiestHour: string | null; quietestHour: string | null; bestOpportunityHour: string | null;
  };
  capacity: {
    maxAdditionalLessons: number; weeklySellableCapacityHours: number; monthlySellableCapacityHours: number;
    teachersNearCapacity: number; teachersFullyBooked: number; teachersBelow50: number;
  };
  heatmapByDay: { day: string; bookedHours: number; capacityHours: number }[];
  heatmapByHour: { hour: string; bookedMinutes: number }[];
  preservation: { avgPct: number; studentsChangedTeacher: number; teachersHighestRetention: { name: string; pct: number }[]; teachersLosingStudents: { name: string; pct: number }[] };
  sellable: { recoverableEmptyHours: number; recoverablePrimeTimeHours: number; topTeachersBySellable: { name: string; hours: number }[] };
  stability: {
    changesToday: number; changesWeek: number; changesMonth: number;
    teacherChanges: number; cancelledLessons: number; rescheduledLessons: number; stabilityPct: number;
  };
  teacherRows: TeacherIntelligenceRow[];
}

interface Inputs {
  teachers: Teacher[];
  students: Student[];
  courses: Course[];
  allLessons: LessonWithParticipants[]; // all 7 days, active/trial only
  allAvailability: UnifiedAvailabilitySlot[]; // all 7 days
  allExceptions: LessonExceptionRecord[];
  todayDayOfWeek: number;
}

/** Pure — the single aggregator behind the whole Intelligence Center. Every
 * number here is derived from real, already-fetched data (lessons,
 * availability, exceptions, students, courses) — nothing invented. */
export function computeAcademyHealth({ teachers, students, courses, allLessons, allAvailability, allExceptions, todayDayOfWeek }: Inputs): AcademyHealthResult {
  const activeTeachers = teachers.filter((t) => !t.isDeleted);
  const courseCategoryById = new Map(courses.map((c) => [c.id, c.category]));
  const exceptionsByLesson = new Map<string, LessonExceptionRecord[]>();
  allExceptions.forEach((e) => {
    const arr = exceptionsByLesson.get(e.lessonId) ?? [];
    arr.push(e);
    exceptionsByLesson.set(e.lessonId, arr);
  });

  const teacherRows: TeacherIntelligenceRow[] = activeTeachers.map((teacher) => {
    const lessons = allLessons.filter((l) => l.teacherId === teacher.id);
    const availability = allAvailability.filter((a) => a.teacherId === teacher.id);

    const bookedMinutes = lessons.reduce((s, l) => s + l.durationMinutes, 0);
    const availableMinutes = availability.reduce((s, a) => s + (a.endMinute - a.startMinute), 0);
    const primeMinutes = lessons.reduce((s, l) => s + primeOverlapMinutes(l.startMinute, l.durationMinutes), 0);
    const primeCapacityMinutes = availability.reduce((s, a) => s + Math.max(0, Math.min(a.endMinute, PRIME_TIME_END_MINUTE) - Math.max(a.startMinute, PRIME_TIME_START_MINUTE)), 0);
    const todayLessons = lessons.filter((l) => l.dayOfWeek === todayDayOfWeek);
    const emptyMinutes = Math.max(availableMinutes - bookedMinutes, 0);

    const studentIds = new Set(lessons.flatMap((l) => l.participants.map((p) => p.studentId)));
    const groupsCount = lessons.filter((l) => l.participants.length > 1).length;
    const oneToOneCount = lessons.filter((l) => l.participants.length <= 1).length;
    const courseTypes = [...new Set(lessons.map((l) => l.courseId && courseCategoryById.get(l.courseId)).filter(Boolean))] as string[];

    const preservationScores = lessons.map((l) => computeLessonPreservationScore(l));
    const preservationPct = preservationScores.length ? Math.round(preservationScores.reduce((s, v) => s + v, 0) / preservationScores.length) : 100;

    const lessonIds = lessons.map((l) => l.id);
    const teacherExceptions = lessonIds.flatMap((id) => exceptionsByLesson.get(id) ?? []);

    const occupancyPct = availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 1000) / 10 : 0;
    const weeklyHours = Math.round((bookedMinutes / 60) * 10) / 10;

    return {
      teacherId: teacher.id,
      teacherName: teacher.fullName,
      teacherType: teacher.teacherType,
      courseTypes,
      todayHours: Math.round((todayLessons.reduce((s, l) => s + l.durationMinutes, 0) / 60) * 10) / 10,
      todayLessons: todayLessons.length,
      weeklyHours,
      weeklyLessons: lessons.length,
      monthlyHours: Math.round(weeklyHours * (30 / 7) * 10) / 10,
      monthlyLessons: Math.round(lessons.length * (30 / 7)),
      primeTimeHours: Math.round((primeMinutes / 60) * 10) / 10,
      primeTimeOccupancyPct: primeCapacityMinutes > 0 ? Math.round((primeMinutes / primeCapacityMinutes) * 1000) / 10 : 0,
      totalOccupancyPct: occupancyPct,
      availableHours: Math.round((availableMinutes / 60) * 10) / 10,
      emptyHours: Math.round((emptyMinutes / 60) * 10) / 10,
      sellableHours: Math.round((emptyMinutes / 60) * 10) / 10,
      studentsCount: studentIds.size,
      groupsCount,
      oneToOneCount,
      currentCapacityLessons: lessons.length,
      remainingCapacitySlots: Math.floor(emptyMinutes / 30),
      preservationPct,
      workloadStatus: workloadStatusFor(occupancyPct),
      cancelledLessons: teacherExceptions.filter((e) => e.status === 'cancelled').length,
      completedLessons: teacherExceptions.filter((e) => e.status === 'completed').length,
    };
  });

  const totalAvailableMinutes = teacherRows.reduce((s, t) => s + t.availableHours * 60, 0);
  const totalBookedMinutes = teacherRows.reduce((s, t) => s + t.weeklyHours * 60, 0);
  // Summed directly from availability (not reverse-derived from occupancy%) so a
  // teacher with real prime-time bookings but zero recorded availability doesn't
  // collapse academy-wide capacity to 0 while used hours stay nonzero.
  const activeTeacherIds = new Set(activeTeachers.map((t) => t.id));
  const totalPrimeCapacityMinutes = allAvailability
    .filter((a) => activeTeacherIds.has(a.teacherId))
    .reduce((s, a) => s + Math.max(0, Math.min(a.endMinute, PRIME_TIME_END_MINUTE) - Math.max(a.startMinute, PRIME_TIME_START_MINUTE)), 0);
  const totalPrimeCapacity = totalPrimeCapacityMinutes / 60;
  const totalPrimeUsed = teacherRows.reduce((s, t) => s + t.primeTimeHours, 0);

  const lessonsToday = allLessons.filter((l) => l.dayOfWeek === todayDayOfWeek).length;
  const activeStudentsCount = students.filter((s) => !s.isDeleted && s.status === 'active').length;

  // Heat map by day: booked hours per day-of-week across all teachers (real, from lessons table).
  const heatmapByDay = DAYS_OF_WEEK.map(({ value }) => {
    const dayLessons = allLessons.filter((l) => l.dayOfWeek === value);
    const dayAvailability = allAvailability.filter((a) => a.dayOfWeek === value);
    return {
      day: String(value),
      bookedHours: Math.round((dayLessons.reduce((s, l) => s + l.durationMinutes, 0) / 60) * 10) / 10,
      capacityHours: Math.round((dayAvailability.reduce((s, a) => s + (a.endMinute - a.startMinute), 0) / 60) * 10) / 10,
    };
  });
  const byDayBooked = heatmapByDay.filter((d) => d.bookedHours > 0);
  const busiestDay = byDayBooked.length ? byDayBooked.reduce((a, b) => (b.bookedHours > a.bookedHours ? b : a)).day : null;
  const quietestDay = byDayBooked.length ? byDayBooked.reduce((a, b) => (b.bookedHours < a.bookedHours ? b : a)).day : null;

  // Heat map by hour (30-min buckets rolled to hour): booked minutes per hour across the week.
  const hourBuckets = new Map<number, number>();
  allLessons.forEach((l) => {
    const hour = Math.floor(l.startMinute / 60);
    hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + l.durationMinutes);
  });
  const heatmapByHour = [...hourBuckets.entries()].sort((a, b) => a[0] - b[0]).map(([hour, mins]) => ({ hour: `${String(hour).padStart(2, '0')}:00`, bookedMinutes: mins }));
  const busiestHourEntry = heatmapByHour.length ? heatmapByHour.reduce((a, b) => (b.bookedMinutes > a.bookedMinutes ? b : a)) : null;
  const quietestHourEntry = heatmapByHour.length ? heatmapByHour.reduce((a, b) => (b.bookedMinutes < a.bookedMinutes ? b : a)) : null;

  // Best opportunity hour: the prime-time hour with the most unused (available-but-empty) capacity.
  const primeHourEmpty = new Map<number, number>();
  for (let h = PRIME_TIME_START_MINUTE / 60; h < PRIME_TIME_END_MINUTE / 60; h++) {
    const hStart = h * 60, hEnd = hStart + 60;
    const cap = allAvailability.reduce((s, a) => s + Math.max(0, Math.min(a.endMinute, hEnd) - Math.max(a.startMinute, hStart)), 0);
    const booked = allLessons.reduce((s, l) => s + Math.max(0, Math.min(l.startMinute + l.durationMinutes, hEnd) - Math.max(l.startMinute, hStart)), 0);
    primeHourEmpty.set(h, Math.max(cap - booked, 0));
  }
  const bestOpportunity = [...primeHourEmpty.entries()].sort((a, b) => b[1] - a[1])[0];

  const stabilityChanges = (days: number) => {
    const cutoff = Date.now() - days * 86400000;
    return allExceptions.filter((e) => new Date(e.createdAt).getTime() >= cutoff).length;
  };
  const totalActiveLessons = allLessons.length;
  const totalStabilityEvents = allExceptions.length;

  const sortedByPreservation = [...teacherRows].filter((t) => t.weeklyLessons > 0).sort((a, b) => b.preservationPct - a.preservationPct);

  return {
    overview: {
      teacherOccupancyRate: totalAvailableMinutes > 0 ? Math.round((totalBookedMinutes / totalAvailableMinutes) * 1000) / 10 : 0,
      primeTimeOccupancyPct: totalPrimeCapacity > 0 ? Math.round((totalPrimeUsed / totalPrimeCapacity) * 1000) / 10 : 0,
      unusedPrimeTimeHours: Math.round(Math.max(totalPrimeCapacity - totalPrimeUsed, 0) * 10) / 10,
      totalEmptyHours: Math.round(Math.max((totalAvailableMinutes - totalBookedMinutes) / 60, 0) * 10) / 10,
      sellableEmptyHours: Math.round(Math.max((totalAvailableMinutes - totalBookedMinutes) / 60, 0) * 10) / 10,
      availableBookableSlots: Math.floor(Math.max(totalAvailableMinutes - totalBookedMinutes, 0) / 30),
      weeklyCapacityHours: Math.round((totalAvailableMinutes / 60) * 10) / 10,
      monthlyCapacityHours: Math.round((totalAvailableMinutes / 60) * (30 / 7) * 10) / 10,
      lessonsToday,
      lessonsWeekly: totalActiveLessons,
      lessonsMonthly: Math.round(totalActiveLessons * (30 / 7)),
      activeStudents: activeStudentsCount,
      activeTeachers: activeTeachers.length,
      avgLessonsPerTeacher: activeTeachers.length > 0 ? Math.round((totalActiveLessons / activeTeachers.length) * 10) / 10 : 0,
      avgLessonsPerStudent: activeStudentsCount > 0 ? Math.round((totalActiveLessons / activeStudentsCount) * 10) / 10 : 0,
      hasAvailabilityData: totalAvailableMinutes > 0,
    },
    distribution: {
      overloaded: teacherRows.filter((t) => t.workloadStatus === 'overloaded' || t.workloadStatus === 'critical').length,
      balanced: teacherRows.filter((t) => t.workloadStatus === 'balanced').length,
      underutilized: teacherRows.filter((t) => t.workloadStatus === 'very_light').length,
      zeroLessons: teacherRows.filter((t) => t.weeklyLessons === 0).length,
      noPrimeTime: teacherRows.filter((t) => t.primeTimeHours === 0).length,
      unusedAvailability: teacherRows.filter((t) => t.emptyHours > 0).length,
    },
    primeTime: {
      capacityHours: Math.round(totalPrimeCapacity * 10) / 10,
      usedHours: Math.round(totalPrimeUsed * 10) / 10,
      emptyHours: Math.round(Math.max(totalPrimeCapacity - totalPrimeUsed, 0) * 10) / 10,
      sellableHours: Math.round(Math.max(totalPrimeCapacity - totalPrimeUsed, 0) * 10) / 10,
      occupancyPct: totalPrimeCapacity > 0 ? Math.round((totalPrimeUsed / totalPrimeCapacity) * 1000) / 10 : 0,
      busiestDay, quietestDay,
      busiestHour: busiestHourEntry?.hour ?? null,
      quietestHour: quietestHourEntry?.hour ?? null,
      bestOpportunityHour: bestOpportunity ? `${String(bestOpportunity[0]).padStart(2, '0')}:00` : null,
    },
    capacity: {
      maxAdditionalLessons: Math.floor(Math.max(totalAvailableMinutes - totalBookedMinutes, 0) / 30),
      weeklySellableCapacityHours: Math.round(Math.max((totalAvailableMinutes - totalBookedMinutes) / 60, 0) * 10) / 10,
      monthlySellableCapacityHours: Math.round(Math.max((totalAvailableMinutes - totalBookedMinutes) / 60, 0) * (30 / 7) * 10) / 10,
      teachersNearCapacity: teacherRows.filter((t) => t.totalOccupancyPct >= 85 && t.totalOccupancyPct < 100).length,
      teachersFullyBooked: teacherRows.filter((t) => t.totalOccupancyPct >= 100).length,
      teachersBelow50: teacherRows.filter((t) => t.totalOccupancyPct < 50 && t.availableHours > 0).length,
    },
    heatmapByDay,
    heatmapByHour,
    preservation: {
      avgPct: teacherRows.length ? Math.round(teacherRows.reduce((s, t) => s + t.preservationPct, 0) / teacherRows.length) : 100,
      studentsChangedTeacher: allLessons.filter((l) => l.teacherId !== l.originalTeacherId).length,
      teachersHighestRetention: sortedByPreservation.slice(0, 3).map((t) => ({ name: t.teacherName, pct: t.preservationPct })),
      teachersLosingStudents: sortedByPreservation.slice(-3).reverse().map((t) => ({ name: t.teacherName, pct: t.preservationPct })),
    },
    sellable: {
      recoverableEmptyHours: Math.round(Math.max((totalAvailableMinutes - totalBookedMinutes) / 60, 0) * 10) / 10,
      recoverablePrimeTimeHours: Math.round(Math.max(totalPrimeCapacity - totalPrimeUsed, 0) * 10) / 10,
      topTeachersBySellable: [...teacherRows].sort((a, b) => b.sellableHours - a.sellableHours).slice(0, 5).map((t) => ({ name: t.teacherName, hours: t.sellableHours })),
    },
    stability: {
      changesToday: stabilityChanges(1),
      changesWeek: stabilityChanges(7),
      changesMonth: stabilityChanges(30),
      teacherChanges: allExceptions.filter((e) => e.overrideTeacherId !== null).length,
      cancelledLessons: allExceptions.filter((e) => e.status === 'cancelled').length,
      rescheduledLessons: allExceptions.filter((e) => e.status === 'rescheduled').length,
      stabilityPct: totalActiveLessons > 0 ? Math.round(Math.max(1 - totalStabilityEvents / totalActiveLessons, 0) * 1000) / 10 : 100,
    },
    teacherRows,
  };
}
