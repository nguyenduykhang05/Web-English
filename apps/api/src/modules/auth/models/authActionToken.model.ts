import mongoose, { Schema, type Document } from 'mongoose';

export type AuthActionTokenKind = 'email_verify' | 'password_reset' | 'teacher_invite';

export interface IAuthActionToken extends Document {
  userId: mongoose.Types.ObjectId;
  kind: AuthActionTokenKind;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

const authActionTokenSchema = new Schema<IAuthActionToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: {
      type: String,
      enum: ['email_verify', 'password_reset', 'teacher_invite'],
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

authActionTokenSchema.index({ userId: 1, kind: 1 });

export const AuthActionToken = mongoose.model<IAuthActionToken>(
  'AuthActionToken',
  authActionTokenSchema,
);
