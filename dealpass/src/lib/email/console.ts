import type { CampaignResult, EmailContact, EmailProvider } from './types';

/**
 * No-op email provider used when no credentials are configured.
 *
 * It is NOT a silent stub: every message is logged to the server console, so a
 * developer can copy the double opt-in link and complete the flow by hand
 * without any external account.
 */
export class ConsoleProvider implements EmailProvider {
  readonly name = 'console';
  readonly configured = false;

  private log(kind: string, detail: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info(`[email:${kind}]`, JSON.stringify(detail));
  }

  async upsertContact(contact: EmailContact): Promise<{ id: string }> {
    this.log('upsert', { email: contact.email });
    return { id: `local-${contact.email}` };
  }

  async updateLists(email: string, listIds: number[], unlinkListIds: number[] = []): Promise<void> {
    this.log('update-lists', { email, listIds, unlinkListIds });
  }

  async sendDoubleOptIn(email: string, confirmationUrl: string): Promise<void> {
    this.log('double-opt-in', { email, confirmationUrl });
  }

  async sendTransactional(input: { to: string; subject: string; html: string; text: string }): Promise<void> {
    this.log('transactional', { to: input.to, subject: input.subject });
  }

  async createCampaign(input: {
    name: string;
    subject: string;
    html: string;
    listIds: number[];
  }): Promise<CampaignResult> {
    this.log('campaign-created', { name: input.name, subject: input.subject });
    return { id: `local-${Date.now()}`, status: 'draft' };
  }

  async sendCampaign(id: string, scheduledAt?: Date): Promise<void> {
    this.log('campaign-sent', { id, scheduledAt: scheduledAt?.toISOString() ?? 'immediate' });
  }

  async unsubscribe(email: string): Promise<void> {
    this.log('unsubscribe', { email });
  }
}
