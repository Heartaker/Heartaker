import type { EmailProvider } from './types';
import { BrevoProvider } from './brevo';
import { ConsoleProvider } from './console';

/**
 * Provider factory.
 *
 * With no credentials the console provider is used: nothing is sent, but the
 * double opt-in flow, segmentation and unsubscribe logic all still execute for
 * real, so the entire newsletter system can be developed and tested before a
 * Brevo account exists.
 */

let instance: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (instance) return instance;

  const requested = (process.env.EMAIL_PROVIDER ?? 'brevo').toLowerCase();

  if (requested === 'brevo' && process.env.BREVO_API_KEY) {
    instance = new BrevoProvider();
  } else {
    instance = new ConsoleProvider();
  }

  return instance;
}

export function resetEmailProvider(): void {
  instance = null;
}

export type { EmailProvider };
