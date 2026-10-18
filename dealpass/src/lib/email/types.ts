/**
 * Email / newsletter provider abstraction.
 *
 * The application never calls Brevo directly — it calls this interface. That
 * keeps the provider swappable and, more importantly, means the app runs
 * correctly with no email provider configured at all (development, testing,
 * and the period before you open a Brevo account).
 */

export interface EmailContact {
  email: string;
  attributes?: Record<string, unknown>;
  listIds?: number[];
}

export interface CampaignResult {
  id: string;
  status: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;

  /** Create or update a contact. */
  upsertContact(contact: EmailContact): Promise<{ id: string }>;

  /** Move a contact into / out of lists. */
  updateLists(email: string, listIds: number[], unlinkListIds?: number[]): Promise<void>;

  /** Send the double opt-in confirmation email. */
  sendDoubleOptIn(email: string, confirmationUrl: string, attributes?: Record<string, unknown>): Promise<void>;

  /** Send a transactional email (welcome, password reset, admin alerts). */
  sendTransactional(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;

  /** Create a marketing campaign. Returns a preview/send handle. */
  createCampaign(input: {
    name: string;
    subject: string;
    html: string;
    listIds: number[];
  }): Promise<CampaignResult>;

  /** Send an existing campaign immediately, or schedule it. */
  sendCampaign(id: string, scheduledAt?: Date): Promise<void>;

  /** Remove a contact from all marketing (unsubscribe / suppression). */
  unsubscribe(email: string): Promise<void>;

  /** Fetch engagement statistics for a campaign. */
  campaignStats?(id: string): Promise<{ delivered: number; opens: number; clicks: number }>;
}

export class EmailNotConfiguredError extends Error {
  constructor(provider: string) {
    super(
      `Email provider "${provider}" is not configured. Set the required environment variables ` +
        `or the newsletters will be recorded locally only (no email is sent).`,
    );
    this.name = 'EmailNotConfiguredError';
  }
}
