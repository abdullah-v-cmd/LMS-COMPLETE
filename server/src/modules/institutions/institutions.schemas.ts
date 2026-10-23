import { z } from 'zod';

export const createInstitutionSchema = z.object({
  name: z.string().min(2, 'Institution name must be at least 2 characters'),
  code: z.string().min(2, 'Code must be at least 2 characters').toUpperCase(),
  slug: z.string().min(2, 'Slug must be at least 2 characters').toLowerCase(),
  currency: z.string().default('USD'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional(),
});

export const updateInstitutionSchema = createInstitutionSchema.partial();
