import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(160),
  content: z.string().trim().min(5, 'Content must be at least 5 characters').max(10000),
  targetRole: z.nativeEnum(UserRole).optional(),
  isPinned: z.boolean().default(false),
});

export const sendMessageSchema = z.object({
  receiverId: z.string().uuid('Valid receiver user ID is required'),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1, 'Message body cannot be empty').max(10000),
});

export const notificationIdSchema = z.object({ id: z.string().uuid() });
