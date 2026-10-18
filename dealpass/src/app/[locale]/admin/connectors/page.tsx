import { notFound } from 'next/navigation';
import { ConnectorsClient } from '@/components/admin/connectors-client';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { requirePermission } from '@/lib/auth/rbac';
import { adminListConnectors } from '@/lib/services/admin';
import { connectorCredentialStatus } from '@/lib/connectors/registry';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ConnectorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  await requirePermission('integrations.read');
  const [networks, credentials] = await Promise.all([
    adminListConnectors(),
    Promise.resolve(connectorCredentialStatus()),
  ]);

  const bySlug = new Map(credentials.map((c) => [c.slug, c]));

  const connectors = networks.map((network) => {
    const cred = bySlug.get(network.slug);
    return {
      slug: network.slug,
      name: network.name,
      integrationType: network.integration_type,
      status: network.status,
      health: network.health_status,
      frequency: network.synchronization_frequency,
      isDemo: network.is_demo,
      lastSync: network.last_sync_at,
      requiredEnv: network.required_env ?? [],
      missing: cred?.missing ?? network.required_env ?? [],
      configured: cred?.configured ?? false,
      mappingVerified: cred?.mappingVerified ?? false,
      complianceNotes: network.compliance_notes,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.admin.connectors}</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Only the demonstration connector is enabled on a fresh install. A real
          connector needs approved programme access, its credentials in the
          environment, and a response mapping verified against the provider&apos;s
          official documentation.
        </p>
      </div>

      <ConnectorsClient
        connectors={connectors}
        locale={locale}
        labels={{
          test: t.admin.testConnection,
          sync: t.admin.manualSync,
          enable: t.admin.enable,
          disable: t.admin.disable,
          health: t.admin.health,
          lastSync: t.admin.lastSync,
          credentials: t.admin.credentials,
          configured: t.admin.configured,
          notConfigured: t.admin.notConfigured,
          mappingUnverified: t.admin.mappingUnverified,
          integration: t.admin.integration,
          frequency: t.admin.frequency,
          required: 'Required',
          compliance: 'Compliance',
          enabled: t.admin.enabled,
          disabled: t.admin.disabled,
        }}
      />
    </div>
  );
}
