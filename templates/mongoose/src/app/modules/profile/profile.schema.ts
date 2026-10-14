import { model, Schema } from 'mongoose';
import type { T_profile } from './profile.interface.js';

const profileSchema = new Schema<T_profile>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'account', required: true, unique: true },
    fullName: { type: String, required: true, trim: true },
    profilePhoto: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

export const profile_model = model('profile', profileSchema);
