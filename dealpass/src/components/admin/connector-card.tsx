'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Play, Plug, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export interface ConnectorView {
  slug: string;
  name: string;
  integrationType: string;
  status: string;
  health: string;
  frequency: string;
  isDemo: boolean;
  lastSync: string | null;
  requiredEnv: string[];
  missing: string[];
  configured: boolean;
  mappingVerified: boolean;
  complianceNotes: string | null;
}

interface ConnectorCardProps {
  connector: ConnectorView;
  labels: {
    test: string;
    sync: string;
    enable: string;
    disable: string;
    health: string;
    lastSync: string;
    credentials: string;
    configured: string;
    notConfigured: string;
    mappingUnverified: string;
    integration: string;
    frequency: string;
    required: string;
    compliance: string;
    enabled: string;
    disabled: string;
  };
  onTest: (slug: string) => Promise<{ ok: boolean; message: string }>;
  onSync: (slug: string) => Promise<{ ok: boolean; message: string }>;
  onToggle: (slug: string, enabled: boolean) => Promise<{ ok: boolean; message: string }>;
}

/**
 * Connector tile for the administration dashboard.
 *
 * Shows credential presence as a masked status only — never a value. Secrets
 * stay in the environment; nothing here can leak one.
 */
export function ConnectorCard({ connector, labels, onTest, onSync, onToggle }: ConnectorCardProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const enabled = connector.status === 'enabled';

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage({ ok: result.ok, text: result.message });
    });
  };

  return (
    <article
      className={cn(
        'card p-4',
        connector.isDemo && 'border-amber-300 dark:border-amber-800',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Plug className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            <span className="truncate">{connector.name}</span>
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            {labels.integration}: {connector.integrationType} · {labels.frequency}: {connector.frequency}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? labels.enabled : labels.disabled}</Badge>
          <Badge
            tone={
              connector.health === 'healthy' ? 'success'
                : connector.health === 'failing' ? 'danger'
                  : 'neutral'
            }
          >
            {connector.health}
          </Badge>
        </div>
      </div>

      {/* Credential status — masked, never a value */}
      <div className="mt-3 space-y-1">
        {connector.requiredEnv.length === 0 ? (
          <p className="text-xs text-ink-muted">No credentials required (local connector).</p>
        ) : (
          connector.requiredEnv.map((name) => {
            const missing = connector.missing.includes(name);
            return (
              <p key={name} className="flex items-center gap-1.5 text-xs">
                {missing ? (
                  <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                )}
                <code className="font-mono text-ink-muted">{name}</code>
                <span className={missing ? 'text-red-600' : 'text-emerald-600'}>
                  {missing ? labels.notConfigured : labels.configured}
                </span>
              </p>
            );
          })
        )}

        {!connector.mappingVerified && !connector.isDemo ? (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {labels.mappingUnverified}
          </p>
        ) : null}
      </div>

      {connector.complianceNotes ? (
        <p className="mt-3 border-t border-line pt-2 text-xs text-ink-muted">
          <strong className="font-medium text-ink">{labels.compliance} : </strong>
          {connector.complianceNotes}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => onTest(connector.slug))}
          className="btn-outline btn-sm"
        >
          {labels.test}
        </button>
        <button
          type="button"
          disabled={pending || !enabled}
          onClick={() => run(() => onSync(connector.slug))}
          className="btn-primary btn-sm"
        >
          <Play className="h-3 w-3" aria-hidden="true" />
          {labels.sync}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => onToggle(connector.slug, !enabled))}
          className={cn('btn-sm', enabled ? 'btn-outline' : 'btn-accent')}
        >
          {enabled ? labels.disable : labels.enable}
        </button>
      </div>

      {connector.lastSync ? (
        <p className="mt-2 text-xs text-ink-muted">
          {labels.lastSync}: {new Date(connector.lastSync).toLocaleString()}
        </p>
      ) : null}

      <div role="status" aria-live="polite" className="mt-2 min-h-4 text-xs">
        {message ? (
          <span className={message.ok ? 'text-emerald-600' : 'text-red-600'}>{message.text}</span>
        ) : null}
      </div>
    </article>
  );
}
