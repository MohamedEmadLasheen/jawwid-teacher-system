import { MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';

/**
 * Mouse drag starts after 8px of travel, so a click that doesn't move is
 * unambiguously a click.
 */
export const MOUSE_DRAG_DISTANCE_PX = 8;

/**
 * Touch drag starts only after a 220ms hold (with 8px of slop). Below that
 * the gesture belongs to the page.
 */
export const TOUCH_DRAG_DELAY_MS = 220;
export const TOUCH_DRAG_TOLERANCE_PX = 8;

/**
 * THE schedule's drag activation rules.
 *
 * Without them, dnd-kit's default PointerSensor activates on pointerdown with
 * no constraint, and the lesson card claims the gesture the instant a finger
 * lands on it: a plain tap can be swallowed before it becomes a click, and a
 * vertical swipe that happens to start on a card drags the lesson instead of
 * scrolling the grid. On a phone, where the schedule is mostly used, that
 * makes tapping a lesson unreliable — which is exactly what mobile Quick
 * Actions depends on.
 *
 * These constraints apply to DRAGGING only. The quick actions are never
 * behind a long press: a tap opens them immediately.
 *
 * Exported as a hook so the production grid and the browser tests use the
 * same configuration rather than two copies that can drift.
 */
export function useScheduleDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_DISTANCE_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: TOUCH_DRAG_TOLERANCE_PX },
    }),
    useSensor(KeyboardSensor)
  );
}
