import type { Types } from 'mongoose';

export type T_profile = {
  accountId: Types.ObjectId;
  fullName: string;
  profilePhoto: string | null;
};
