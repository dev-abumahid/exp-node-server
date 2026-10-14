import { z } from 'zod';
const update_profile = z.object({
  fullName: z.string().trim().min(1).max(100).optional(),
});

export const profile_validations = {
  update_profile,
};
