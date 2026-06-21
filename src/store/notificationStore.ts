import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Notifications themselves are derived from live domain data (see
 * src/lib/notifications.ts → buildNotifications). This store only persists
 * per-user UI state: which notification IDs have been read or dismissed.
 * IDs are stable (tied to the underlying record), so this state survives
 * reloads without storing any notification content.
 */
interface NotificationState {
  readIds: string[];
  dismissedIds: string[];
  markAsRead: (id: string) => void;
  markAllAsRead: (ids: string[]) => void;
  dismiss: (id: string) => void;
  clearAll: (ids: string[]) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      readIds: [],
      dismissedIds: [],

      markAsRead: (id) =>
        set((state) =>
          state.readIds.includes(id) ? state : { readIds: [...state.readIds, id] }
        ),

      markAllAsRead: (ids) =>
        set((state) => ({
          readIds: Array.from(new Set([...state.readIds, ...ids])),
        })),

      dismiss: (id) =>
        set((state) => ({
          dismissedIds: state.dismissedIds.includes(id)
            ? state.dismissedIds
            : [...state.dismissedIds, id],
        })),

      clearAll: (ids) =>
        set((state) => ({
          dismissedIds: Array.from(new Set([...state.dismissedIds, ...ids])),
        })),
    }),
    { name: 'jawwid-notifications-v2' }
  )
);
