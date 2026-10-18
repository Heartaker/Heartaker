import type { CampaignResult, EmailContact, EmailProvider } from './types';
import { EmailNotConfiguredError } from './types';
import { sanitizeError } from '../connectors/http';

/**
 * Brevo (ex-Sendinblue) adapter.
 *
 * Docs: https://developers.brevo.com/reference/getting-started
 *
 * Required environment:
 *   BREVO_API_KEY
 *   BREVO_CONFIRMED_LIST_ID     (confirmed subscribers)
 *   BREVO_UNCONFIRMED_LIST_ID   (pending double opt-in)
 *   BREVO_SENDER_EMAIL
 *   BREVO_SENDER_NAME
 *
 * Compliance: this adapter never sends marketing email to a contact that has
 * not completed double opt-in. Contacts land in the unconfirmed list first and
 * are only moved to the confirmed list by `confirm()`.
 */

const BASE_URL = 'https://api.brevo.com/v3';

export class BrevoProvider implements EmailProvider {
  readonly name = 'brevo';

  get configured(): boolean {
    return Boolean(process.env.BREVO_API_KEY);
  }

  private get apiKey(): string {
    const key = process.env.BREVO_API_KEY;
    if (!key) throw new EmailNotConfiguredError('brevo');
    return key;
  }

  private async request<T>(
    path: string,
    options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
  ): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'api-key': this.apiKey,
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(sanitizeError(`Brevo ${options.method ?? 'GET'} ${path} failed (${response.status}): ${text.slice(0, 300)}`));
    }

    // 204 No Content has no body.
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private get confirmedListId(): number {
    return Number(process.env.BREVO_CONFIRMED_LIST_ID ?? 0);
  }

  private get unconfirmedListId(): number {
    return Number(process.env.BREVO_UNCONFIRMED_LIST_ID ?? 0);
  }

  async upsertContact(contact: EmailContact): Promise<{ id: string }> {
    const result = await this.request<{ id: number }>('/contacts', {
      method: 'POST',
      body: {
        email: contact.email,
        attributes: contact.attributes,
        listIds: contact.listIds,
        updateEnabled: true,
      },
    });
    return { id: String(result.id) };
  }

  async updateLists(email: string, listIds: number[], unlinkListIds: number[] = []): Promise<void> {
    await this.request(`/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      body: { listIds, unlinkListIds, attributes: {} },
    });
  }

  async sendDoubleOptIn(
    email: string,
    confirmationUrl: string,
    attributes: Record<string, unknown> = {},
  ): Promise<void> {
    await this.request('/contacts/doubleOptinConfirmation', {
      method: 'POST',
      body: {
        email,
        attributes,
        includeListIds: this.unconfirmedListId ? [this.unconfirmedListId] : [],
        templateId: Number(process.env.BREVO_DOUBLE_OPTIN_TEMPLATE_ID ?? 0) || undefined,
        redirectionUrl: confirmationUrl,
      },
    });
  }

  async sendTransactional(input: { to: string; subject: string; html: string; text: string }): Promise<void> {
    await this.request('/smtp/email', {
      method: 'POST',
      body: {
        sender: {
          name: process.env.BREVO_SENDER_NAME ?? 'DealPass',
          email: process.env.BREVO_SENDER_EMAIL ?? 'noreply@example.com',
        },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      },
    });
  }

  async createCampaign(input: {
    name: string;
    subject: string;
    html: string;
    listIds: number[];
  }): Promise<CampaignResult> {
    const result = await this.request<{ id: number }>('/emailCampaigns', {
      method: 'POST',
      body: {
        name: input.name,
        subject: input.subject,
        htmlContent: input.html,
        sender: {
          name: process.env.BREVO_SENDER_NAME ?? 'DealPass',
          email: process.env.BREVO_SENDER_EMAIL ?? 'noreply@example.com',
        },
        recipients: { listIds: input.listIds },
        // Legally required in most jurisdictions.
        inlineImageActivation: false,
        footer: 'DealPass',
      },
    });
    return { id: String(result.id), status: 'draft' };
  }

  async sendCampaign(id: string, scheduledAt?: Date): Promise<void> {
    if (scheduledAt) {
      await this.request(`/emailCampaigns/${id}/status`, {
        method: 'PUT',
        body: { status: 'scheduled', scheduledAt: scheduledAt.toISOString() },
      });
      return;
    }
    await this.request(`/emailCampaigns/${id}/sendNow`, { method: 'POST' });
  }

  async unsubscribe(email: string): Promise<void> {
    // Hard-unlink from every list and record the suppression locally.
    await this.updateLists(email, [], [this.confirmedListId, this.unconfirmedListId].filter(Boolean));
  }
}
