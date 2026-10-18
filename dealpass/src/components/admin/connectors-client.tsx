'use client';

import { ConnectorCard, type ConnectorView } from './connector-card';
import {
  testConnector,
  syncConnector,
  setConnectorEnabled,
} from '@/app/[locale]/admin/actions';

/**
 * Client wrapper that binds server actions to the connector cards.
 *
 * The functions are called from the client, but each server action re-verifies
 * the caller's permissions on the server, so granting access here grants
 * nothing by itself.
 */
export function ConnectorsClient({
  connectors,
  locale,
  labels,
}: {
  connectors: ConnectorView[];
  locale: string;
  labels: Parameters<typeof ConnectorCard>[0]['labels'];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {connectors.map((connector) => (
        <ConnectorCard
          key={connector.slug}
          connector={connector}
          labels={labels}
          onTest={(slug) => testConnector(slug, locale)}
          onSync={(slug) => syncConnector(slug, locale)}
          onToggle={(slug, enabled) => setConnectorEnabled(slug, enabled, locale)}
        />
      ))}
    </div>
  );
}
