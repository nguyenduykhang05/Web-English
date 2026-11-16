import mongoose, { Schema, type Document } from 'mongoose';

export interface ICoursePackage extends Document {
  courseId: mongoose.Types.ObjectId;
  code: string;
  name: string;
  subtitle?: string;
  sessionsCount: number;
  durationMinutes: number;
  validityDays: number;
  priceVnd: number;
  originalPriceVnd?: number;
  features: string[];
  isActive: boolean;
}

const coursePackageSchema = new Schema<ICoursePackage>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    subtitle: { type: String },
    sessionsCount: { type: Number, required: true, min: 1 },
    durationMinutes: { type: Number, required: true, default: 50 },
    validityDays: { type: Number, required: true, default: 120 },
    priceVnd: { type: Number, required: true, min: 0 },
    originalPriceVnd: { type: Number },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const CoursePackage = mongoose.model<ICoursePackage>(
  'CoursePackage',
  coursePackageSchema,
);
