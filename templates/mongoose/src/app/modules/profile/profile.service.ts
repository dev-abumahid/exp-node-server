import { Request } from 'express';
import uploadCloud from '../../utils/cloudinary.js';
import { profile_model } from './profile.schema.js';

const update_profile_into_db = async (req: Request) => {
  const payload: { fullName?: string } = req.body;

  // validation already ran (see profile.route.ts), so only valid requests upload
  const profilePhoto = req.file ? (await uploadCloud(req.file, 'profiles')).secure_url : undefined;

  // only the known fields, never the raw body (no operator or field injection)
  const update = {
    ...(payload.fullName !== undefined && { fullName: payload.fullName }),
    ...(profilePhoto !== undefined && { profilePhoto }),
  };

  return profile_model
    .findOneAndUpdate(
      { accountId: req.user!.accountId },
      { $set: update },
      { returnDocument: 'after' },
    )
    .lean();
};

export const profile_service = {
  update_profile_into_db,
};
