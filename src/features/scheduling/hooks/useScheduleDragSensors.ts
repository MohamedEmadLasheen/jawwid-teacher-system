import { MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * Mouse drag starts after 8px of travel, so a click that doesn't move is
 * unambiguously a click.
 */
export const MOUSE_DRAG_DISTANCE_PX = 8;

/**
 * Touch drag — on touch screens at desktop widths only, see below — starts
 * after a deliberate hold, with a little slop for an unsteady finger.
 */
export const TOUCH_DRAG_DELAY_MS = 220;
export const TOUCH_DRAG_TOLERANCE_PX = 8;

/**
 * THE schedule's drag activation rules.
 *
 * Mouse and keyboard dragging are always available, so desktop is unchanged —
 * including a desktop window narrowed below the breakpoint, because the mouse
 * sensor is never removed.
 *
 * Touch dragging is DISABLED below 768px, deliberately.
 *
 * On a phone the lesson card sits inside a container that scrolls
 * horizontally, on a page that scrolls vertically, and it is also the tap
 * target that opens Quick Actions. A touch drag has to be told apart from all
 * three starting from the same finger-down, and the only dial available is an
 * activation delay: short enough to feel responsive and it fires in the
 * middle of a scroll; long enough to be safe and every tap feels stuck. That
 * is what made the gesture work "sometimes" — the outcome depended on how
 * fast the user happened to move, which is not a contract. Even when
 * activation did work, landing on the intended 30-minute column with a
 * fingertip is error-prone.
 *
 * Quick Actions does everything the drag did — change the time, change the
 * teacher — through the same conflict check and the same move_lesson RPC, and
 * adds the recurring-scope choice the drag path never offered. The drag is
 * not a lost capability on mobile; it was a less reliable second route to one
 * that is still there.
 *
 * Dropping the sensor drops the touch activator entirely: useDraggable then
 * attaches no touch listeners at all, so scrolling is plain native scrolling
 * and a tap is plainly a tap. Nothing is left half-wired.
 */
export function useScheduleDragSensors() {
  const isMobile = useIsMobile();

  const mouse = useSensor(MouseSensor, {
    activationConstraint: { distance: MOUSE_DRAG_DISTANCE_PX },
  });
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: TOUCH_DRAG_TOLERANCE_PX },
  });
  const keyboard = useSensor(KeyboardSensor);

  // Both lists are built unconditionally — useSensors is a hook, so it cannot
  // be called behind a branch. Only which one is returned varies.
  const withTouch = useSensors(mouse, touch, keyboard);
  const withoutTouch = useSensors(mouse, keyboard);

  return isMobile ? withoutTouch : withTouch;
}
