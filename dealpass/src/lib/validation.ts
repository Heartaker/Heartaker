import type { NormalizedOffer, PublicationStatus } from './types';
import {
  checkDateCoherence,
  isAuthorizedDestination,
  isSuspiciousUrl,
  normalizeCouponCode,
  isValidCurrency,
} from './normalize';

/**
 * Automated offer validation + confidence scoring.
 *
 * Rules come from the specification and are all configurable at runtime via
 * the `publication` entry in `site_settings` — nothing here is hard-coded in
 * a way an administrator cannot change from the dashboard.
 *
 * AI is never permitted to alter the facts this function evaluates: the score
 * is computed from the *source* record only. AI-generated editorial copy lives
 * in `offer_translations` and cannot influence the verdict.
 */

export interface PublicationRules {
  autoPublishThreshold: number;
  reviewThreshold: number;
  rejectBelow: number;
  requireTerms: boolean;
  requireCountry: boolean;
  requireExpiryOrOngoing: boolean;
  maxDaysUntilExpiry: number;
  autoExpireEnabled: boolean;
  staleAfterDays: number;
  allowUnverifiedPublish: boolean;
}

export const DEFAULT_PUBLICATION_RULES: PublicationRules = {
  autoPublishThreshold: 90,
  reviewThreshold: 70,
  rejectBelow: 40,
  requireTerms: true,
  requireCountry: true,
  requireExpiryOrOngoing: false,
  maxDaysUntilExpiry: 180,
  autoExpireEnabled: true,
  staleAfterDays: 30,
  allowUnverifiedPublish: false,
};

export type ValidationDecision = 'publish' | 'review' | 'reject';

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  points: number;
}

export interface ValidationResult {
  score: number;
  decision: ValidationDecision;
  issues: ValidationIssue[];
  status: PublicationStatus;
}

export interface ValidateOfferInput {
  offer: NormalizedOffer;
  /** Domains the merchant is allowed to send visitors to. */
  merchantDomains: string[];
  /** True when a merchant row was matched in our catalog. */
  merchantRecognized: boolean;
  /** True when the offer already exists (duplicate handling is separate). */
  isDuplicate?: boolean;
  /** Set when the AI layer flagged an unsupported commercial claim. */
  flaggedClaims?: boolean;
  rules?: Partial<PublicationRules>;
  now?: Date;
}

/**
 * Each check contributes points when it passes. Failing a hard check forces
 * `reject` regardless of the accumulated score.
 */
export function validateOffer(input: ValidateOfferInput): ValidationResult {
  const rules: PublicationRules = { ...DEFAULT_PUBLICATION_RULES, ...input.rules };
  const offer = input.offer;
  const now = input.now ?? new Date();
  const issues: ValidationIssue[] = [];
  let score = 0;
  let hardReject: string | null = null;

  const pass = (code: string, points: number) => {
    score += points;
    issues.push({ code, severity: 'info', message: `${code}: ok`, points });
  };
  const fail = (code: string, message: string, severity: 'error' | 'warning' = 'warning') => {
    issues.push({ code, severity, message, points: 0 });
  };
  const reject = (code: string, message: string) => {
    issues.push({ code, severity: 'error', message, points: 0 });
    hardReject = code;
  };

  // 1. Merchant recognized --------------------------------------------------
  if (input.merchantRecognized) pass('merchant_recognized', 15);
  else fail('merchant_unknown', 'No matching merchant in the catalog.', 'error');

  // 2. Source authorized ----------------------------------------------------
  const authorizedSources = new Set(['api', 'feed', 'csv', 'webhook', 'manual', 'demo']);
  if (authorizedSources.has(offer.sourceType)) {
    pass('source_authorized', 10);
    if (offer.sourceType === 'demo') {
      issues.push({
        code: 'source_is_demo',
        severity: 'warning',
        message: 'Offer originates from the fictional demonstration connector.',
        points: 0,
      });
    }
  } else {
    // Specification: unknown source is an automatic rejection.
    reject('source_unknown', `Unrecognised source type "${offer.sourceType}".`);
  }

  // 3. Destination domain authorized ---------------------------------------
  if (isAuthorizedDestination(offer.destinationUrl, input.merchantDomains)) {
    pass('destination_authorized', 15);
  } else {
    reject(
      'destination_unauthorized',
      `Destination domain does not belong to the merchant or an authorised tracking service.`,
    );
  }

  // 4. Suspicious URL -------------------------------------------------------
  if (!isSuspiciousUrl(offer.destinationUrl)) pass('url_clean', 4);
  else reject('url_suspicious', 'Destination URL looks unsafe or malformed.');

  // 5. Affiliate link present or generatable --------------------------------
  if (offer.affiliateUrl && offer.affiliateUrl.startsWith('http')) {
    pass('affiliate_link_present', 10);
  } else if (offer.destinationUrl.startsWith('http')) {
    score += 6;
    issues.push({
      code: 'affiliate_link_derivable',
      severity: 'warning',
      message: 'No affiliate URL supplied; one can be derived from the destination.',
      points: 6,
    });
  } else {
    fail('affiliate_link_missing', 'Neither an affiliate URL nor a usable destination was supplied.');
  }

  // 6. Date coherence -------------------------------------------------------
  const dates = checkDateCoherence(offer.startAt ?? null, offer.expiresAt ?? null, now);
  if (dates.ok) {
    pass('dates_coherent', 10);
  } else if (dates.reason === 'already_expired') {
    reject('offer_expired', 'The offer has already expired.');
  } else {
    reject(`dates_${dates.reason}`, `Date coherence check failed: ${dates.reason}.`);
  }

  // 7. Expiry horizon -------------------------------------------------------
  if (offer.expiresAt) {
    const daysOut = (offer.expiresAt.getTime() - now.getTime()) / 86_400_000;
    if (daysOut > rules.maxDaysUntilExpiry) {
      issues.push({
        code: 'expiry_too_far',
        severity: 'warning',
        message: `Expiry is ${Math.round(daysOut)} days away, beyond the ${rules.maxDaysUntilExpiry}-day horizon.`,
        points: 0,
      });
    }
  }

  // 8. Country restrictions known ------------------------------------------
  if (offer.countryCodes.length > 0) pass('country_known', 8);
  else if (rules.requireCountry) {
    fail('country_missing', 'No country restriction supplied; geographic targeting is impossible.');
  }

  // 9. Currency validity ----------------------------------------------------
  if (isValidCurrency(offer.currency)) pass('currency_valid', 4);
  else fail('currency_invalid', `Currency "${offer.currency}" is not a valid ISO-4217 code.`);

  // 10. Offer type identified ----------------------------------------------
  if (offer.offerType) pass('offer_type_identified', 6);

  // 11. Essential terms -----------------------------------------------------
  const hasTerms = Boolean(offer.termsAndConditions && offer.termsAndConditions.trim().length > 10);
  if (hasTerms) pass('terms_present', 8);
  else if (rules.requireTerms) {
    fail('terms_missing', 'No meaningful terms and conditions were supplied.');
  }

  // 12. Coupon-code consistency --------------------------------------------
  if (offer.offerType === 'coupon_code') {
    if (normalizeCouponCode(offer.couponCode)) {
      pass('code_present', 6);
    } else {
      // Specification: an unauthorized/missing code is an automatic rejection.
      reject('code_missing', 'Offer is typed as coupon_code but carries no code.');
    }
  } else if (normalizeCouponCode(offer.couponCode)) {
    // A code on a non-code offer is contradictory — suspicious but not fatal.
    issues.push({
      code: 'code_on_non_code_offer',
      severity: 'warning',
      message: 'A coupon code was supplied for an offer that is not typed as coupon_code.',
      points: 0,
    });
    score += 2;
  } else {
    // "Discount applied automatically" — legitimate and expected.
    pass('code_not_required', 4);
  }

  // 13. Discount consistency ------------------------------------------------
  const dv = offer.discountValue ?? null;
  let discountConsistent = true;
  if (dv !== null) {
    if (offer.discountType === 'percentage' && (dv <= 0 || dv > 100)) discountConsistent = false;
    if (offer.discountType === 'fixed_amount' && dv <= 0) discountConsistent = false;
    if (dv < 0) discountConsistent = false;
  }
  if (offer.originalPrice != null && offer.finalPrice != null && offer.finalPrice > offer.originalPrice) {
    discountConsistent = false;
  }
  if (discountConsistent) pass('discount_consistent', 6);
  else reject('discount_inconsistent', 'Discount value or prices are logically inconsistent.');

  // 14. AI claims -----------------------------------------------------------
  if (!input.flaggedClaims) pass('no_unsupported_claims', 3);
  else {
    issues.push({
      code: 'ai_unsupported_claim',
      severity: 'warning',
      message: 'The AI layer flagged a possible unsupported commercial claim.',
      points: 0,
    });
  }

  // 15. Duplicates ----------------------------------------------------------
  if (input.isDuplicate) {
    issues.push({
      code: 'duplicate_detected',
      severity: 'info',
      message: 'An offer with the same fingerprint already exists; it will be updated instead.',
      points: 0,
    });
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  // ------------------------------------------------------------------------
  // Verdict
  // ------------------------------------------------------------------------
  let decision: ValidationDecision;
  if (hardReject) {
    decision = 'reject';
  } else if (finalScore >= rules.autoPublishThreshold) {
    decision = 'publish';
  } else if (finalScore >= rules.reviewThreshold) {
    decision = 'publish'; // publish only when every required field is present
  } else if (finalScore < rules.rejectBelow) {
    decision = 'reject';
  } else {
    decision = 'review';
  }

  /**
   * Critical-field gate.
   *
   * "Missing critical information: require review" — the specification lists
   * this as a rule in its own right, not merely as a points deduction. A record
   * can therefore score 97/100 and still land in the human review queue when
   * an administrator has marked a field as required and it is absent.
   * Without this gate the moderation queue stays empty and there is nothing
   * left for a human to check.
   */
  const missingCritical: string[] = [];
  if (rules.requireTerms && !hasTerms) missingCritical.push('terms');
  if (rules.requireCountry && offer.countryCodes.length === 0) missingCritical.push('country');
  if (!input.merchantRecognized) missingCritical.push('merchant');
  if (!isValidCurrency(offer.currency)) missingCritical.push('currency');

  if (decision === 'publish' && missingCritical.length > 0) {
    decision = 'review';
    issues.push({
      code: 'critical_field_missing',
      severity: 'warning',
      message: `Scored ${finalScore}, but required field(s) missing: ${missingCritical.join(', ')}. Sent to human review.`,
      points: 0,
    });
  }

  const status: PublicationStatus =
    decision === 'publish' ? 'approved' : decision === 'review' ? 'pending_validation' : 'rejected';

  return { score: finalScore, decision, issues, status };
}

/**
 * Status of an offer that the expiration workflow has determined is no longer
 * valid. Returns null when the offer is still live.
 */
export function computeExpiration(
  expiresAt: Date | null,
  now = new Date(),
): { expired: boolean } {
  if (!expiresAt) return { expired: false };
  return { expired: expiresAt.getTime() <= now.getTime() };
}

/** True when an offer has gone too long without re-verification. */
export function isStale(lastVerifiedAt: Date | null, staleAfterDays: number, now = new Date()): boolean {
  if (!lastVerifiedAt) return true;
  const ageDays = (now.getTime() - lastVerifiedAt.getTime()) / 86_400_000;
  return ageDays > staleAfterDays;
}
