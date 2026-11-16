import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: 'admin' | 'teacher' | 'student';
  status: 'pending' | 'active' | 'locked';
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  timezone: string;
  locale: string;
  emailVerifiedAt?: Date;
  lastLoginAt?: Date;
  failedLoginCount: number;
  lockedUntil?: Date;
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'teacher', 'student'], required: true, index: true },
    status: { type: String, enum: ['pending', 'active', 'locked'], required: true, default: 'pending', index: true },
    fullName: { type: String, required: true },
    phone: { type: String },
    avatarUrl: { type: String },
    timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
    locale: { type: String, default: 'vi' },
    emailVerifiedAt: { type: Date },
    lastLoginAt: { type: Date },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date }
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  if (this.passwordHash.startsWith('$2a$') || this.passwordHash.startsWith('$2b$')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

userSchema.methods.comparePassword = async function (password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.index({ createdAt: 1 });
userSchema.index({ role: 1, status: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
