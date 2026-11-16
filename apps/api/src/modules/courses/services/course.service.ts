import type {
  CreateCouponInput,
  CreateCourseInput,
  CreateCoursePackageInput,
  GoalType,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { Coupon } from '../models/coupon.model.js';
import { Course } from '../models/course.model.js';
import { CoursePackage } from '../models/coursePackage.model.js';

export async function listCourses(query: { goalType?: GoalType; includeUnpublished?: boolean }) {
  const filter: Record<string, unknown> = {};
  if (!query.includeUnpublished) filter.isPublished = true;
  if (query.goalType) filter.goalType = query.goalType;

  const [courses, packages] = await Promise.all([
    Course.find(filter).sort({ createdAt: -1 }).lean(),
    CoursePackage.find(query.includeUnpublished ? {} : { isActive: true }).sort({ priceVnd: 1 }).lean(),
  ]);

  return courses.map((course) => ({
    id: String(course._id),
    slug: course.slug,
    title: course.title,
    description: course.description,
    goalType: course.goalType,
    targetCefrRange: course.targetCefrRange,
    syllabusOutline: course.syllabusOutline,
    isPublished: course.isPublished,
    packages: packages
      .filter((pkg) => String(pkg.courseId) === String(course._id))
      .map((pkg) => ({
        id: String(pkg._id),
        code: pkg.code,
        name: pkg.name,
        subtitle: pkg.subtitle,
        sessionsCount: pkg.sessionsCount,
        durationMinutes: pkg.durationMinutes,
        validityDays: pkg.validityDays,
        priceVnd: pkg.priceVnd,
        originalPriceVnd: pkg.originalPriceVnd,
        features: pkg.features,
        isActive: pkg.isActive,
      })),
  }));
}

export async function createCourse(input: CreateCourseInput, actor: { id: string; ip?: string }) {
  const exists = await Course.findOne({ slug: input.slug });
  if (exists) {
    throw new AppError(409, 'COURSE_EXISTS', 'Course slug already exists');
  }
  const created = await Course.create(input);
  await AuditLog.create({
    actorId: actor.id,
    action: 'course.created',
    entity: 'Course',
    entityId: String(created._id),
    after: { slug: created.slug, title: created.title },
    ip: actor.ip,
  });
  return { id: String(created._id), ...created.toObject() };
}

export async function updateCourse(
  id: string,
  input: Partial<CreateCourseInput>,
  actor: { id: string; ip?: string },
) {
  const updated = await Course.findByIdAndUpdate(id, input, { new: true }).lean();
  if (!updated) throw new AppError(404, 'NOT_FOUND', 'Course not found');
  await AuditLog.create({
    actorId: actor.id,
    action: 'course.updated',
    entity: 'Course',
    entityId: id,
    after: input,
    ip: actor.ip,
  });
  return { id: String(updated._id), ...updated };
}

export async function createCoursePackage(
  input: CreateCoursePackageInput,
  actor: { id: string; ip?: string },
) {
  const course = await Course.findById(input.courseId).lean();
  if (!course) {
    throw new AppError(404, 'NOT_FOUND', 'Course not found');
  }
  const exists = await CoursePackage.findOne({ code: input.code });
  if (exists) {
    throw new AppError(409, 'PACKAGE_EXISTS', 'Package code already exists');
  }
  const pkg = await CoursePackage.create(input);
  await AuditLog.create({
    actorId: actor.id,
    action: 'package.created',
    entity: 'CoursePackage',
    entityId: String(pkg._id),
    after: { code: pkg.code, sessionsCount: pkg.sessionsCount, priceVnd: pkg.priceVnd },
    ip: actor.ip,
  });
  return { id: String(pkg._id), ...pkg.toObject() };
}

export async function createCoupon(input: CreateCouponInput, actor: { id: string; ip?: string }) {
  const exists = await Coupon.findOne({ code: input.code });
  if (exists) {
    throw new AppError(409, 'COUPON_EXISTS', 'Coupon code already exists');
  }
  const coupon = await Coupon.create({
    ...input,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
  });
  await AuditLog.create({
    actorId: actor.id,
    action: 'coupon.created',
    entity: 'Coupon',
    entityId: String(coupon._id),
    after: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue },
    ip: actor.ip,
  });
  return { id: String(coupon._id), ...coupon.toObject() };
}

export async function evaluateCouponDiscount(
  code: string,
  subtotalVnd: number,
): Promise<{ couponId: string; code: string; discountVnd: number }> {
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) {
    throw new AppError(400, 'INVALID_COUPON', 'Coupon code is invalid or inactive');
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new AppError(400, 'COUPON_EXPIRED', 'Coupon code has expired');
  }
  if (coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) {
    throw new AppError(400, 'COUPON_EXHAUSTED', 'Coupon usage limit reached');
  }

  const rawDiscount =
    coupon.discountType === 'percent'
      ? Math.round((subtotalVnd * Math.min(100, coupon.discountValue)) / 100)
      : coupon.discountValue;
  const discountVnd = Math.max(0, Math.min(subtotalVnd, rawDiscount));

  return {
    couponId: String(coupon._id),
    code: coupon.code,
    discountVnd,
  };
}
