import { Request } from 'express';
import { prisma } from '../../lib/prisma.js';
import uploadCloud from '../../utils/cloudinary.js';

const update_profile_into_db = async (req: Request) => {
  const payload: { fullName?: string } = req.body;

  // validation already ran (see profile.route.ts), so only valid requests upload
  const profilePhoto = req.file ? (await uploadCloud(req.file, 'profiles')).secure_url : undefined;

  return prisma.profile.update({
    where: { accountId: req.user!.accountId },
    data: { fullName: payload.fullName, profilePhoto },
  });
};

export const profile_service = {
  update_profile_into_db,
};
