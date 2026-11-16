import { createHash } from 'crypto';
import { AppError } from '../../middleware/errorHandler.js';
import { StudentProfile } from '../students/models/studentProfile.model.js';
import { User } from '../users/models/user.model.js';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s\-().]{7,18}\d)/g;

export function redactPiiText(rawText: string, extraPiiTerms: (string | undefined)[] = []): string {
  let clean = rawText
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]');

  for (const term of extraPiiTerms) {
    const trimmed = term?.trim();
    if (!trimmed || trimmed.length < 3) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(escaped, 'gi'), '[LEARNER]');
  }
  return clean;
}

export function hashPrompt(anonymizedPrompt: string): string {
  return createHash('sha256').update(anonymizedPrompt).digest('hex');
}

export function makeAnonymousLearnerTag(studentId: string): string {
  const digest = createHash('sha256').update(studentId).digest('hex').slice(0, 8).toUpperCase();
  return `LEARNER-${digest}`;
}

/**
 * Privacy & consent enforcement (ASSUMPTIONS.md #4):
 * Never process AI features without explicit student consent.aiProcessingAccepted,
 * and gather PII strings to strip before sending anything to LLM providers.
 */
export async function verifyConsentAndLoadPiiStrings(studentId: string): Promise<{
  learnerTag: string;
  piiTermsToRedact: string[];
}> {
  const [user, profile] = await Promise.all([
    User.findById(studentId).select('fullName email phone').lean(),
    StudentProfile.findOne({ userId: studentId }).select('consents guardian').lean(),
  ]);

  if (!profile?.consents?.aiProcessingAccepted) {
    throw new AppError(
      403,
      'AI_CONSENT_REQUIRED',
      'Student has not granted consent for AI processing (consents.aiProcessingAccepted)',
    );
  }

  const piiTermsToRedact: string[] = [];
  if (user?.fullName) piiTermsToRedact.push(user.fullName);
  if (user?.email) piiTermsToRedact.push(user.email);
  if (user?.phone) piiTermsToRedact.push(user.phone);
  if (profile.guardian?.fullName) piiTermsToRedact.push(profile.guardian.fullName);
  if (profile.guardian?.email) piiTermsToRedact.push(profile.guardian.email);
  if (profile.guardian?.phone) piiTermsToRedact.push(profile.guardian.phone);

  return {
    learnerTag: makeAnonymousLearnerTag(studentId),
    piiTermsToRedact,
  };
}
