import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppNotification, NotificationType } from '../lib/types';
import { generateId } from '../lib/utils';

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (
    type: NotificationType,
    titleAr: string,
    titleEn: string,
    messageAr: string,
    messageEn: string,
    link?: string
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

const SAMPLE_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    type: 'critical',
    titleAr: 'معلم في خطر',
    titleEn: 'Teacher At Risk',
    messageAr: 'المعلم محمد عبدالله السيد تم تصنيفه كمعلم في خطر مرتفع',
    messageEn: 'Teacher Mohammed Abdullah has been classified as High Risk',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    link: '/teachers/teacher-3',
  },
  {
    id: 'notif-2',
    type: 'warning',
    titleAr: 'خطة تحسين تستحق المتابعة',
    titleEn: 'Improvement Plan Due',
    messageAr: 'خطة تحسين تستحق المراجعة خلال 3 أيام',
    messageEn: 'An improvement plan is due for review in 3 days',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'notif-3',
    type: 'info',
    titleAr: 'تقييم جديد',
    titleEn: 'New Evaluation Added',
    messageAr: 'تم إضافة تقييم جديد للمعلمة فاطمة حسن',
    messageEn: 'A new evaluation was added for teacher Fatima Hassan',
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: 'notif-4',
    type: 'success',
    titleAr: 'مكافأة بانتظار الموافقة',
    titleEn: 'Bonus Awaiting Approval',
    messageAr: 'مكافأة للمعلم أحمد محمد تنتظر موافقتك',
    messageEn: 'A bonus for teacher Ahmed Mohammed awaits your approval',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
];

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: SAMPLE_NOTIFICATIONS,

      addNotification: (type, titleAr, titleEn, messageAr, messageEn, link) => {
        const newNotif: AppNotification = {
          id: generateId(),
          type,
          titleAr,
          titleEn,
          messageAr,
          messageEn,
          isRead: false,
          createdAt: new Date().toISOString(),
          link,
        };
        set((state) => ({ notifications: [newNotif, ...state.notifications] }));
      },

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        }));
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        }));
      },

      deleteNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearAll: () => {
        set({ notifications: [] });
      },
    }),
    { name: 'jawwid-notifications-v1' }
  )
);