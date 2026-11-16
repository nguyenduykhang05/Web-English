import { randomInt } from 'crypto';
import type { ClientSession } from 'mongoose';
import type {
  ConfirmManualPaymentInput,
  CreateEnrollmentInput,
  FreezeEnrollmentInput,
  RefundInvoiceInput,
  UserRole,
} from '@webenglish/shared';
import { withTransaction } from '../../../config/db.js';
import { AppError } from '../../../middleware/errorHandler.js';
import { Coupon } from '../../courses/models/coupon.model.js';
import { CoursePackage } from '../../courses/models/coursePackage.model.js';
import { evaluateCouponDiscount } from '../../courses/services/course.service.js';
import { appendLedgerEntry, getEnrollmentBalance } from '../../ledger/services/ledger.service.js';
import { Invoice, type IInvoice } from '../../payments/models/invoice.model.js';
import { Payment, type IPayment } from '../../payments/models/payment.model.js';
import { getPaymentProvider, verifyVnpaySignature } from '../../payments/payment.provider.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { User } from '../../users/models/user.model.js';
import { Enrollment, type IEnrollment } from '../models/enrollment.model.js';

function generateInvoiceCode(): string {
  const year = new Date().getUTCFullYear();
  const suffix = String(randomInt(1000, 9999));
  const tsTail = String(Date.now()).slice(-3);
  return `WE-INV-${year}-${suffix}${tsTail}`;
}

export async function createEnrollmentWithInvoice(
  input: CreateEnrollmentInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  const targetStudentId =
    actor.role === 'admin' && input.studentId ? input.studentId : actor.id;

  if (actor.role === 'teacher') {
    throw new AppError(403, 'FORBIDDEN', 'Teachers cannot create student enrollments');
  }

  const [studentUser, pkg] = await Promise.all([
    User.findById(targetStudentId).select('fullName role').lean(),
    CoursePackage.findOne({ _id: input.packageId, isActive: true }).lean(),
  ]);

  if (!studentUser || studentUser.role !== 'student') {
    throw new AppError(404, 'NOT_FOUND', 'Student account not found');
  }
  if (!pkg) {
    throw new AppError(404, 'NOT_FOUND', 'Course package not found or inactive');
  }

  if (input.teacherId) {
    const teacherUser = await User.findOne({
      _id: input.teacherId,
      role: 'teacher',
      status: 'active',
    }).lean();
    if (!teacherUser) {
      throw new AppError(404, 'NOT_FOUND', 'Assigned teacher not found or inactive');
    }
  }

  const subtotalVnd = pkg.priceVnd;
  let discountVnd = 0;
  let normalizedCoupon: string | undefined;

  if (input.couponCode) {
    const evaluated = await evaluateCouponDiscount(input.couponCode, subtotalVnd);
    discountVnd = evaluated.discountVnd;
    normalizedCoupon = evaluated.code;
  }

  const totalVnd = Math.max(0, subtotalVnd - discountVnd);
  const invoiceCode = generateInvoiceCode();
  const paymentMeta = await getPaymentProvider(input.paymentMethod).initiatePayment({
    invoiceCode,
    amountVnd: totalVnd,
    studentName: studentUser.fullName,
    clientIp: actor.ip,
  });

  return withTransaction(async (session) => {
    const opts = session ? { session } : undefined;
    const [enrollment] = await Enrollment.create(
      [
        {
          studentId: targetStudentId,
          teacherId: input.teacherId,
          courseId: pkg.courseId,
          packageId: pkg._id,
          couponCode: normalizedCoupon,
          status: 'pending_payment',
          purchasedSessions: pkg.sessionsCount,
          durationMinutes: pkg.durationMinutes,
          validityDays: pkg.validityDays,
          notes: input.notes,
        },
      ],
      opts,
    );

    const [invoice] = await Invoice.create(
      [
        {
          invoiceCode,
          enrollmentId: enrollment._id,
          studentId: targetStudentId,
          packageId: pkg._id,
          subtotalVnd,
          discountVnd,
          totalVnd,
          couponCode: normalizedCoupon,
          status: 'unpaid',
        },
      ],
      opts,
    );

    const [payment] = await Payment.create(
      [
        {
          invoiceId: invoice._id,
          enrollmentId: enrollment._id,
          studentId: targetStudentId,
          provider: paymentMeta.provider,
          amountVnd: totalVnd,
          status: 'pending',
          paymentMeta: {
            bankName: paymentMeta.bankName,
            accountNumber: paymentMeta.accountNumber,
            accountHolder: paymentMeta.accountHolder,
            transferNote: paymentMeta.transferNote,
            vietQrImageUrl: paymentMeta.vietQrImageUrl,
            checkoutUrl: paymentMeta.checkoutUrl,
          },
        },
      ],
      opts,
    );

    await AuditLog.create(
      [
        {
          actorId: actor.id,
          action: 'enrollment.created',
          entity: 'Enrollment',
          entityId: String(enrollment._id),
          after: {
            studentId: targetStudentId,
            packageCode: pkg.code,
            invoiceCode,
            totalVnd,
          },
          ip: actor.ip,
        },
      ],
      opts,
    );

    return {
      enrollment: {
        id: String(enrollment._id),
        status: enrollment.status,
        purchasedSessions: enrollment.purchasedSessions,
        teacherId: enrollment.teacherId ? String(enrollment.teacherId) : undefined,
        remainingSessions: 0,
      },
      invoice: {
        id: String(invoice._id),
        invoiceCode: invoice.invoiceCode,
        subtotalVnd: invoice.subtotalVnd,
        discountVnd: invoice.discountVnd,
        totalVnd: invoice.totalVnd,
        status: invoice.status,
      },
      payment: {
        id: String(payment._id),
        provider: payment.provider,
        amountVnd: payment.amountVnd,
        status: payment.status,
        paymentMeta: payment.paymentMeta,
      },
    };
  });
}

async function finalizeConfirmedPaymentInSession(params: {
  payment: IPayment;
  invoice: IInvoice;
  enrollment: IEnrollment;
  session: ClientSession | null;
  confirmedBy?: string;
  transactionRef?: string;
  notes?: string;
  auditAction: string;
  ip?: string;
}) {
  const { payment, invoice, enrollment, session } = params;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + enrollment.validityDays * 24 * 60 * 60 * 1000);

  payment.status = 'confirmed';
  if (params.confirmedBy) {
    payment.confirmedBy = params.confirmedBy as unknown as typeof payment.confirmedBy;
  }
  payment.confirmedAt = now;
  if (params.transactionRef) payment.transactionRef = params.transactionRef;
  if (params.notes) payment.notes = params.notes;
  await payment.save({ session: session ?? undefined });

  invoice.status = 'paid';
  invoice.paidAt = now;
  await invoice.save({ session: session ?? undefined });

  enrollment.status = 'active';
  enrollment.activatedAt = now;
  enrollment.expiresAt = expiresAt;
  await enrollment.save({ session: session ?? undefined });

  // Single Source of Truth: append credit to SessionLedger (never mutate any balance counter)
  await appendLedgerEntry(
    {
      studentId: enrollment.studentId,
      enrollmentId: enrollment._id,
      type: 'purchase',
      delta: enrollment.purchasedSessions,
      reason: `Kích hoạt gói học qua hoá đơn ${invoice.invoiceCode}`,
      referenceType: 'Invoice',
      referenceId: String(invoice._id),
      actorId: params.confirmedBy,
    },
    session,
  );

  if (enrollment.couponCode) {
    await Coupon.updateOne(
      { code: enrollment.couponCode },
      { $inc: { usedCount: 1 } },
      session ? { session } : undefined,
    );
  }

  await StudentProfile.findOneAndUpdate(
    { userId: enrollment.studentId },
    { $set: { lifecycleStatus: 'active' } },
    { upsert: true, session: session ?? undefined },
  );

  await AuditLog.create(
    [
      {
        actorId: params.confirmedBy,
        action: params.auditAction,
        entity: 'Payment',
        entityId: String(payment._id),
        after: {
          invoiceCode: invoice.invoiceCode,
          enrollmentId: String(enrollment._id),
          creditedSessions: enrollment.purchasedSessions,
          provider: payment.provider,
        },
        ip: params.ip,
      },
    ],
    session ? { session } : undefined,
  );

  return getEnrollmentBalance(String(enrollment._id), session);
}

export async function confirmManualPayment(
  paymentId: string,
  input: ConfirmManualPaymentInput,
  adminActor: { id: string; ip?: string },
) {
  return withTransaction(async (session) => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) {
      throw new AppError(404, 'NOT_FOUND', 'Payment not found');
    }
    if (payment.status === 'confirmed') {
      throw new AppError(409, 'ALREADY_CONFIRMED', 'Payment is already confirmed');
    }

    const invoice = await Invoice.findById(payment.invoiceId).session(session);
    const enrollment = await Enrollment.findById(payment.enrollmentId).session(session);
    if (!invoice || !enrollment) {
      throw new AppError(404, 'NOT_FOUND', 'Related invoice or enrollment missing');
    }

    const balance = await finalizeConfirmedPaymentInSession({
      payment,
      invoice,
      enrollment,
      session,
      confirmedBy: adminActor.id,
      transactionRef: input.transactionRef,
      notes: input.notes,
      auditAction: 'payment.confirmed',
      ip: adminActor.ip,
    });

    return {
      paymentId: String(payment._id),
      paymentStatus: payment.status,
      invoiceStatus: invoice.status,
      enrollmentId: String(enrollment._id),
      enrollmentStatus: enrollment.status,
      remainingSessions: balance,
    };
  });
}

export async function handleVnpayIpn(rawParams: Record<string, unknown>, ip?: string) {
  if (!verifyVnpaySignature(rawParams)) {
    return { RspCode: '97', Message: 'Invalid Checksum' };
  }

  const txnRef = typeof rawParams.vnp_TxnRef === 'string' ? rawParams.vnp_TxnRef : '';
  const vnpAmount = Number(rawParams.vnp_Amount ?? 0);
  const responseCode = typeof rawParams.vnp_ResponseCode === 'string' ? rawParams.vnp_ResponseCode : '';
  const txStatus = typeof rawParams.vnp_TransactionStatus === 'string' ? rawParams.vnp_TransactionStatus : '';
  const vnpTransactionNo =
    typeof rawParams.vnp_TransactionNo === 'string' ? rawParams.vnp_TransactionNo : undefined;

  return withTransaction(async (session) => {
    const invoice = await Invoice.findOne({ invoiceCode: txnRef }).session(session);
    if (!invoice) {
      return { RspCode: '01', Message: 'Order not found' };
    }
    if (Math.round(invoice.totalVnd * 100) !== Math.round(vnpAmount)) {
      return { RspCode: '04', Message: 'Invalid Amount' };
    }

    const [payment, enrollment] = await Promise.all([
      Payment.findOne({ invoiceId: invoice._id }).session(session),
      Enrollment.findById(invoice.enrollmentId).session(session),
    ]);
    if (!payment || !enrollment) {
      return { RspCode: '01', Message: 'Order not found' };
    }
    if (payment.status === 'confirmed') {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    if (responseCode === '00' && txStatus === '00') {
      await finalizeConfirmedPaymentInSession({
        payment,
        invoice,
        enrollment,
        session,
        transactionRef: vnpTransactionNo ?? `VNPAY-${txnRef}`,
        notes: 'VNPay Sandbox IPN Verified',
        auditAction: 'payment.vnpay_confirmed',
        ip,
      });
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    payment.status = 'failed';
    payment.notes = `VNPay error code: ${responseCode}`;
    await payment.save({ session: session ?? undefined });
    return { RspCode: '00', Message: 'Recorded Failed Payment' };
  });
}

export async function listEnrollmentsForActor(actor: { id: string; role: UserRole }) {
  const filter: Record<string, unknown> = {};
  if (actor.role === 'student') filter.studentId = actor.id;
  if (actor.role === 'teacher') filter.teacherId = actor.id;

  const list = await Enrollment.find(filter).sort({ createdAt: -1 }).lean();
  return Promise.all(
    list.map(async (e) => ({
      id: String(e._id),
      studentId: String(e.studentId),
      teacherId: e.teacherId ? String(e.teacherId) : undefined,
      courseId: String(e.courseId),
      packageId: String(e.packageId),
      status: e.status,
      purchasedSessions: e.purchasedSessions,
      remainingSessions: await getEnrollmentBalance(String(e._id)),
      activatedAt: e.activatedAt,
      expiresAt: e.expiresAt,
    })),
  );
}

export async function listInvoicesAndPayments(actor: { id: string; role: UserRole }) {
  if (actor.role === 'teacher') {
    throw new AppError(403, 'FORBIDDEN', 'Teachers cannot view invoices or payments');
  }

  const filter = actor.role === 'student' ? { studentId: actor.id } : {};
  const [invoices, payments] = await Promise.all([
    Invoice.find(filter).sort({ createdAt: -1 }).lean(),
    Payment.find(filter).sort({ createdAt: -1 }).lean(),
  ]);

  const paymentMap = new Map(payments.map((p) => [String(p.invoiceId), p]));

  return invoices.map((inv) => {
    const p = paymentMap.get(String(inv._id));
    return {
      id: String(inv._id),
      invoiceCode: inv.invoiceCode,
      enrollmentId: String(inv.enrollmentId),
      studentId: String(inv.studentId),
      subtotalVnd: inv.subtotalVnd,
      discountVnd: inv.discountVnd,
      totalVnd: inv.totalVnd,
      status: inv.status,
      paidAt: inv.paidAt,
      payment: p
        ? {
            id: String(p._id),
            provider: p.provider,
            status: p.status,
            amountVnd: p.amountVnd,
            paymentMeta: p.paymentMeta,
            confirmedAt: p.confirmedAt,
          }
        : undefined,
    };
  });
}

export async function refundInvoiceOrEnrollment(
  invoiceId: string,
  input: RefundInvoiceInput,
  adminActor: { id: string; ip?: string },
) {
  return withTransaction(async (session) => {
    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    }
    if (invoice.status === 'refunded') {
      throw new AppError(409, 'ALREADY_REFUNDED', 'Invoice has already been refunded');
    }
    if (invoice.status !== 'paid') {
      throw new AppError(409, 'INVALID_STATE', 'Only paid invoices can be refunded');
    }

    const refundAmountVnd = input.refundAmountVnd ?? invoice.totalVnd;
    if (refundAmountVnd > invoice.totalVnd) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Refund amount cannot exceed invoice total');
    }

    const [payment, enrollment] = await Promise.all([
      Payment.findOne({ invoiceId: invoice._id }).session(session),
      Enrollment.findById(invoice.enrollmentId).session(session),
    ]);

    if (!enrollment) {
      throw new AppError(404, 'NOT_FOUND', 'Related enrollment not found');
    }

    const remainingSessions = await getEnrollmentBalance(String(enrollment._id), session);
    if (remainingSessions > 0) {
      await appendLedgerEntry(
        {
          studentId: invoice.studentId,
          enrollmentId: enrollment._id,
          type: 'refund',
          delta: -remainingSessions,
          reason: `Hoàn tiền hoá đơn ${invoice.invoiceCode}: ${input.reason}`,
          referenceType: 'Invoice',
          referenceId: String(invoice._id),
          actorId: adminActor.id,
        },
        session,
      );
    }

    invoice.status = 'refunded';
    await invoice.save({ session: session ?? undefined });

    if (payment) {
      payment.status = 'refunded';
      payment.notes = `${payment.notes ? `${payment.notes} | ` : ''}Refund: ${input.reason}`;
      await payment.save({ session: session ?? undefined });
    }

    enrollment.status = 'churned';
    await enrollment.save({ session: session ?? undefined });

    await AuditLog.create(
      [
        {
          actorId: adminActor.id,
          action: 'invoice.refunded',
          entity: 'Invoice',
          entityId: String(invoice._id),
          after: {
            invoiceCode: invoice.invoiceCode,
            refundAmountVnd,
            deductedSessions: remainingSessions,
            reason: input.reason,
          },
          ip: adminActor.ip,
        },
      ],
      session ? { session } : undefined,
    );

    const newBalance = await getEnrollmentBalance(String(enrollment._id), session);
    return {
      invoiceId: String(invoice._id),
      invoiceStatus: invoice.status,
      enrollmentStatus: enrollment.status,
      refundAmountVnd,
      deductedSessions: remainingSessions,
      remainingSessions: newBalance,
    };
  });
}

const MAX_FREEZE_DAYS_TOTAL = 30;

export async function freezeEnrollment(
  enrollmentId: string,
  input: FreezeEnrollmentInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  return withTransaction(async (session) => {
    const enrollment = await Enrollment.findById(enrollmentId).session(session);
    if (!enrollment) {
      throw new AppError(404, 'NOT_FOUND', 'Enrollment not found');
    }
    if (actor.role === 'teacher') {
      throw new AppError(403, 'FORBIDDEN', 'Teachers cannot freeze student enrollments');
    }
    if (actor.role === 'student' && String(enrollment.studentId) !== actor.id) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to freeze another student enrollment');
    }
    if (enrollment.status !== 'active') {
      throw new AppError(409, 'INVALID_STATE', 'Only active enrollments can be frozen');
    }

    const nextFrozenTotal = (enrollment.frozenDaysTotal ?? 0) + input.days;
    if (nextFrozenTotal > MAX_FREEZE_DAYS_TOTAL) {
      throw new AppError(
        400,
        'FREEZE_LIMIT_EXCEEDED',
        `Enrollment freeze duration cannot exceed ${MAX_FREEZE_DAYS_TOTAL} cumulative days`,
      );
    }

    const now = new Date();
    const extendMs = input.days * 86_400_000;
    enrollment.status = 'paused';
    enrollment.frozenDaysTotal = nextFrozenTotal;
    enrollment.freezeUntil = new Date(now.getTime() + extendMs);
    enrollment.expiresAt = new Date((enrollment.expiresAt ?? now).getTime() + extendMs);
    await enrollment.save({ session: session ?? undefined });

    await AuditLog.create(
      [
        {
          actorId: actor.id,
          action: 'enrollment.frozen',
          entity: 'Enrollment',
          entityId: String(enrollment._id),
          after: {
            days: input.days,
            frozenDaysTotal: nextFrozenTotal,
            freezeUntil: enrollment.freezeUntil,
            expiresAt: enrollment.expiresAt,
            reason: input.reason,
          },
          ip: actor.ip,
        },
      ],
      session ? { session } : undefined,
    );

    return {
      id: String(enrollment._id),
      status: enrollment.status,
      freezeUntil: enrollment.freezeUntil,
      expiresAt: enrollment.expiresAt,
      frozenDaysTotal: enrollment.frozenDaysTotal,
    };
  });
}

export async function unfreezeEnrollment(
  enrollmentId: string,
  actor: { id: string; role: UserRole; ip?: string },
) {
  return withTransaction(async (session) => {
    const enrollment = await Enrollment.findById(enrollmentId).session(session);
    if (!enrollment) {
      throw new AppError(404, 'NOT_FOUND', 'Enrollment not found');
    }
    if (actor.role === 'teacher') {
      throw new AppError(403, 'FORBIDDEN', 'Teachers cannot unfreeze student enrollments');
    }
    if (actor.role === 'student' && String(enrollment.studentId) !== actor.id) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to unfreeze another student enrollment');
    }
    if (enrollment.status !== 'paused') {
      throw new AppError(409, 'INVALID_STATE', 'Only paused enrollments can be unfrozen');
    }

    enrollment.status = 'active';
    enrollment.freezeUntil = undefined;
    await enrollment.save({ session: session ?? undefined });

    await AuditLog.create(
      [
        {
          actorId: actor.id,
          action: 'enrollment.unfrozen',
          entity: 'Enrollment',
          entityId: String(enrollment._id),
          after: { status: enrollment.status },
          ip: actor.ip,
        },
      ],
      session ? { session } : undefined,
    );

    return {
      id: String(enrollment._id),
      status: enrollment.status,
      expiresAt: enrollment.expiresAt,
    };
  });
}
