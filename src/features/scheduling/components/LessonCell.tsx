import { DraggableLessonCard } from './DraggableLessonCard';
import { LessonHoverCard } from './LessonHoverCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { minuteToX, minuteSpanToWidth } from '../utils/timelineGeometry';
import { GRID_START_MINUTE, GRID_END_MINUTE } from '../constants/schedulingConstants';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface LessonCellProps {
  lesson: LessonWithParticipants;
  columnWidth: number;
  isCompact?: boolean;
  onLessonClick: (lesson: LessonWithParticipants) => void;
}

/**
 * A lesson positioned on the canonical timeline: its left edge is its real
 * start minute and its width is its real duration, both resolved through
 * timelineGeometry — the same functions the time header uses for its column
 * boundaries. So a 15:30 lesson starts exactly under the 15:30 label, and a
 * 40-minute lesson ends exactly under 16:40 instead of being rounded up to
 * the next 30-minute column.
 */
export function LessonCell({ lesson, columnWidth, isCompact = false, onLessonClick }: LessonCellProps) {
  const endMinute = lesson.startMinute + lesson.durationMinutes;
  // The hover preview is desktop-only. Radix ignores touch for hovering, but
  // it still opens on FOCUS — and a tap focuses the card, so on a phone the
  // full preview panel used to unfurl behind the quick-actions sheet every
  // time a lesson was tapped. Mobile gets its context from the sheet's own
  // header instead; "View details" still reaches the full dialog.
  const isMobile = useIsMobile();

  // Entirely outside the visible window — nothing to draw.
  if (endMinute <= GRID_START_MINUTE || lesson.startMinute >= GRID_END_MINUTE) return null;

  return (
    <div
      className="absolute top-0 h-full p-0.5 z-20"
      style={{
        // insetInlineStart, never `left`: the time axis is a flex row, so it
        // reverses under dir="rtl" (Arabic). A physical `left` would stay
        // anchored to the viewport's left edge and mirror away from the
        // header. The logical inset resolves to `right` in RTL, which is
        // exactly where the flex header puts the same minute.
        insetInlineStart: minuteToX(lesson.startMinute, columnWidth),
        width: minuteSpanToWidth(lesson.startMinute, endMinute, columnWidth),
      }}
    >
      {isMobile ? (
        <DraggableLessonCard lesson={lesson} isCompact={isCompact} onClick={() => onLessonClick(lesson)} />
      ) : (
        <LessonHoverCard lesson={lesson}>
          <DraggableLessonCard lesson={lesson} isCompact={isCompact} onClick={() => onLessonClick(lesson)} />
        </LessonHoverCard>
      )}
    </div>
  );
}
