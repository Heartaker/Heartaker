'use client';

import { useState, useTransition } from 'react';
import { saveBrandSettings, savePublicationSettings, saveLocalizationSettings, saveFeatureSettings, saveDisclosureSettings } from '@/app/[locale]/admin/actions';

/**
 * Brand identity, publication thresholds, localisation and disclosure editor.
 *
 * Brand values are stored in `site_settings` and injected as CSS custom
 * properties by the layout, so changes appear across the whole site on the next
 * request — no rebuild, no redeploy.
 */

export interface SettingsValues {
  brand: {
    siteName: string;
    slogan: string;
    domain: string;
    logoUrl: string;
    fontSans: string;
    fontDisplay: string;
    radius: string;
    defaultTheme: 'light' | 'dark';
    colors: { brand: string; accent: string; ink: string; surface: string; line: string };
  };
  publication: {
    autoPublishThreshold: number;
    reviewThreshold: number;
    rejectBelow: number;
    requireTerms: boolean;
    requireCountry: boolean;
    maxDaysUntilExpiry: number;
  };
  localization: {
    defaultLanguage: string;
    defaultCountry: string;
    defaultCurrency: string;
    autoDetect: boolean;
  };
  features: Record<string, boolean>;
  disclosures: { fr: string; en: string; ar: string };
}

interface Labels {
  brand: string;
  siteName: string;
  slogan: string;
  domain: string;
  logoUrl: string;
  colors: string;
  fonts: string;
  radius: string;
  thresholds: string;
  autoPublish: string;
  reviewThreshold: string;
  rejectBelow: string;
  requireTerms: string;
  requireCountry: string;
  localization: string;
  features: string;
  disclosure: string;
  save: string;
  saved: string;
}

export function SettingsForms({
  initial,
  locale,
  labels,
  canConfigure,
}: {
  initial: SettingsValues;
  locale: string;
  labels: Labels;
  canConfigure: boolean;
}) {
  const [brand, setBrand] = useState(initial.brand);
  const [publication, setPublication] = useState(initial.publication);
  const [localization, setLocalization] = useState(initial.localization);
  const [features, setFeatures] = useState(initial.features);
  const [disclosures, setDisclosures] = useState(initial.disclosures);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage({ ok: result.ok, text: result.message });
    });
  };

  const inputClass = 'input';
  const disabled = !canConfigure || pending;

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------ brand */}
      <section className="card p-5">
        <h3 className="mb-4 text-base font-semibold text-ink">{labels.brand}</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={labels.siteName}>
            <input
              className={inputClass}
              value={brand.siteName}
              disabled={disabled}
              onChange={(e) => setBrand({ ...brand, siteName: e.target.value })}
            />
          </Field>

          <Field label={labels.slogan}>
            <input
              className={inputClass}
              value={brand.slogan}
              disabled={disabled}
              onChange={(e) => setBrand({ ...brand, slogan: e.target.value })}
            />
          </Field>

          <Field label={labels.domain}>
            <input
              className={inputClass}
              value={brand.domain}
              disabled={disabled}
              placeholder="dealpass.example"
              onChange={(e) => setBrand({ ...brand, domain: e.target.value })}
            />
          </Field>

          <Field label={labels.logoUrl}>
            <input
              className={inputClass}
              value={brand.logoUrl}
              disabled={disabled}
              placeholder="https://…/logo.svg"
              onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value })}
            />
          </Field>

          <Field label={`${labels.fonts} — body`}>
            <input
              className={inputClass}
              value={brand.fontSans}
              disabled={disabled}
              onChange={(e) => setBrand({ ...brand, fontSans: e.target.value })}
            />
          </Field>

          <Field label={`${labels.fonts} — headings`}>
            <input
              className={inputClass}
              value={brand.fontDisplay}
              disabled={disabled}
              onChange={(e) => setBrand({ ...brand, fontDisplay: e.target.value })}
            />
          </Field>
        </div>

        <fieldset className="mt-5">
          <legend className="label">{labels.colors}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(['brand', 'accent', 'ink', 'surface', 'line'] as const).map((key) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs capitalize text-ink-muted">{key}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`${key} colour`}
                    value={rgbToHex(brand.colors[key])}
                    disabled={disabled}
                    onChange={(e) =>
                      setBrand({
                        ...brand,
                        colors: { ...brand.colors, [key]: hexToRgb(e.target.value) },
                      })
                    }
                    className="h-9 w-12 cursor-pointer rounded border border-line bg-surface"
                  />
                  <input
                    className="input font-mono text-xs"
                    value={brand.colors[key]}
                    disabled={disabled}
                    onChange={(e) =>
                      setBrand({ ...brand, colors: { ...brand.colors, [key]: e.target.value } })
                    }
                  />
                </div>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Values are space-separated RGB channels (for example <code>15 118 110</code>) so
            Tailwind can apply opacity modifiers.
          </p>
        </fieldset>

        {/* Live preview */}
        <div
          className="mt-5 rounded-card border p-4"
          style={{
            background: `rgb(${brand.colors.surface})`,
            borderColor: `rgb(${brand.colors.line})`,
            color: `rgb(${brand.colors.ink})`,
            borderRadius: brand.radius,
            fontFamily: `${brand.fontSans}, ui-sans-serif, system-ui, sans-serif`,
          }}
        >
          <p className="text-xs uppercase tracking-wide opacity-60">Preview</p>
          <p style={{ fontFamily: `${brand.fontDisplay}, sans-serif` }} className="mt-1 text-lg font-bold">
            {brand.siteName || '—'}
          </p>
          <p className="text-sm opacity-70">{brand.slogan}</p>
          <span
            className="mt-3 inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: `rgb(${brand.colors.brand})` }}
          >
            Primary button
          </span>
          <span
            className="ms-2 inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: `rgb(${brand.colors.accent})` }}
          >
            Accent
          </span>
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              submit(() =>
                saveBrandSettings(
                  {
                    siteName: brand.siteName,
                    slogan: brand.slogan,
                    domain: brand.domain,
                    logoUrl: brand.logoUrl,
                    fontSans: brand.fontSans,
                    fontDisplay: brand.fontDisplay,
                    radius: brand.radius,
                    defaultTheme: brand.defaultTheme,
                    brand: brand.colors.brand,
                    accent: brand.colors.accent,
                    ink: brand.colors.ink,
                    surface: brand.colors.surface,
                    line: brand.colors.line,
                  },
                  locale,
                ),
              )
            }
            className="btn-primary btn-md"
          >
            {labels.save}
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------ thresholds */}
      <section className="card p-5">
        <h3 className="mb-4 text-base font-semibold text-ink">{labels.thresholds}</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={labels.autoPublish}>
            <input
              type="number"
              min={0}
              max={100}
              className={inputClass}
              value={publication.autoPublishThreshold}
              disabled={disabled}
              onChange={(e) =>
                setPublication({ ...publication, autoPublishThreshold: Number(e.target.value) })
              }
            />
          </Field>
          <Field label={labels.reviewThreshold}>
            <input
              type="number"
              min={0}
              max={100}
              className={inputClass}
              value={publication.reviewThreshold}
              disabled={disabled}
              onChange={(e) =>
                setPublication({ ...publication, reviewThreshold: Number(e.target.value) })
              }
            />
          </Field>
          <Field label={labels.rejectBelow}>
            <input
              type="number"
              min={0}
              max={100}
              className={inputClass}
              value={publication.rejectBelow}
              disabled={disabled}
              onChange={(e) =>
                setPublication({ ...publication, rejectBelow: Number(e.target.value) })
              }
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-5">
          <Checkbox
            label={labels.requireTerms}
            checked={publication.requireTerms}
            disabled={disabled}
            onChange={(v) => setPublication({ ...publication, requireTerms: v })}
          />
          <Checkbox
            label={labels.requireCountry}
            checked={publication.requireCountry}
            disabled={disabled}
            onChange={(v) => setPublication({ ...publication, requireCountry: v })}
          />
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={disabled}
            onClick={() => submit(() => savePublicationSettings(publication, locale))}
            className="btn-primary btn-md"
          >
            {labels.save}
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------- localization */}
      <section className="card p-5">
        <h3 className="mb-4 text-base font-semibold text-ink">{labels.localization}</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Default language">
            <select
              className={inputClass}
              value={localization.defaultLanguage}
              disabled={disabled}
              onChange={(e) => setLocalization({ ...localization, defaultLanguage: e.target.value })}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </Field>
          <Field label="Default country">
            <input
              className={inputClass}
              value={localization.defaultCountry}
              maxLength={2}
              disabled={disabled}
              onChange={(e) =>
                setLocalization({ ...localization, defaultCountry: e.target.value.toUpperCase() })
              }
            />
          </Field>
          <Field label="Default currency">
            <input
              className={inputClass}
              value={localization.defaultCurrency}
              maxLength={3}
              disabled={disabled}
              onChange={(e) =>
                setLocalization({ ...localization, defaultCurrency: e.target.value.toUpperCase() })
              }
            />
          </Field>
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={disabled}
            onClick={() => submit(() => saveLocalizationSettings(localization, locale))}
            className="btn-primary btn-md"
          >
            {labels.save}
          </button>
        </div>
      </section>

      {/* -------------------------------------------------------- features */}
      <section className="card p-5">
        <h3 className="mb-4 text-base font-semibold text-ink">{labels.features}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(features).map(([key, value]) => (
            <Checkbox
              key={key}
              label={key}
              checked={value}
              disabled={disabled}
              onChange={(v) => setFeatures({ ...features, [key]: v })}
            />
          ))}
        </div>
        <div className="mt-4">
          <button
            type="button"
            disabled={disabled}
            onClick={() => submit(() => saveFeatureSettings(features, locale))}
            className="btn-primary btn-md"
          >
            {labels.save}
          </button>
        </div>
      </section>

      {/* ----------------------------------------------------- disclosure */}
      <section className="card p-5">
        <h3 className="mb-4 text-base font-semibold text-ink">{labels.disclosure}</h3>
        <div className="space-y-3">
          {(['fr', 'en', 'ar'] as const).map((code) => (
            <Field key={code} label={code.toUpperCase()} htmlFor={`disclosure-${code}`}>
              <textarea
                id={`disclosure-${code}`}
                rows={2}
                dir={code === 'ar' ? 'rtl' : 'ltr'}
                className="input resize-y"
                value={disclosures[code]}
                disabled={disabled}
                onChange={(e) => setDisclosures({ ...disclosures, [code]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <div className="mt-4">
          <button
            type="button"
            disabled={disabled}
            onClick={() => submit(() => saveDisclosureSettings(disclosures, locale))}
            className="btn-primary btn-md"
          >
            {labels.save}
          </button>
        </div>
      </section>

      <div role="status" aria-live="polite" className="min-h-5 text-sm">
        {message ? (
          <span className={message.ok ? 'text-emerald-600' : 'text-red-600'}>{message.text}</span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Checkbox({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line"
      />
      {label}
    </label>
  );
}

const FALLBACK_HEX = '#0f766e';

function hexToRgb(hex: string): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return '0 0 0';
  return `${parseInt(match[1]!, 16)} ${parseInt(match[2]!, 16)} ${parseInt(match[3]!, 16)}`;
}

function rgbToHex(rgb: string): string {
  const parts = rgb.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return FALLBACK_HEX;
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(parts[0]!)}${toHex(parts[1]!)}${toHex(parts[2]!)}`;
}
