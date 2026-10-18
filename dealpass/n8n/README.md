# DealPass — n8n automation workflows

Eight scenarios automate the platform. Each one is a thin orchestration layer:
**the logic lives in DealPass**, behind `/api/internal/*` endpoints. n8n owns
the schedule, the retries and the alerting — nothing else. That means you can
re-run any workflow by hand from the admin dashboard, or from `curl`, and get
exactly the same result as the scheduled run.

## Import

1. Open n8n → **Workflows** → **Import from File**.
2. Import all eight JSON files from this directory.
3. Create one credential of type **Header Auth** named
   `DealPass Internal Token`:
   - Name: `X-DealPass-Internal-Token`
   - Value: the same value as `INTERNAL_API_TOKEN` in DealPass.
4. Set the DealPass base URL in each workflow's **Settings** → or better, set
   the environment variables below once and the credentials resolve everywhere.
5. Open workflow **07 - Central Error Handling**, activate it, copy its
   **Workflow ID**, then paste that ID into the *Error Workflow* field of every
   other workflow (Settings → Error Workflow).

## Environment variables n8n needs

```bash
DEALPASS_URL=https://dealpass.example   # no trailing slash
```

`INTERNAL_API_TOKEN` is **not** given to n8n as an environment variable — it is
stored in the Header Auth credential so it never appears in a workflow export.

## The workflows

| # | File | Trigger | Endpoint | What it does |
|---|------|---------|----------|--------------|
| 1 | `01-offer-import.json` | Every 3 h | `POST /api/internal/import` | Runs every enabled connector, validates, scores, publishes or queues for review |
| 2 | `02-offer-expiration.json` | Daily 02:00 | `POST /api/internal/expire` | Moves past-end-date offers to `expired`, warns 48 h ahead |
| 3 | `03-link-validation.json` | Daily 04:00 | `POST /api/internal/validate-links` | Probes 40 affiliate links per run, suspends after 3 consecutive failures |
| 4 | `04-transaction-sync.json` | Every 6 h | `POST /api/internal/sync-transactions` | Commission/conversion sync; records an explicit skip until a network's mapping is verified |
| 5 | `05-newsletter-automation.json` | Weekly | `POST /api/internal/newsletter/dispatch` | Sends the digest to **confirmed** subscribers only |
| 6 | `06-daily-report.json` | Daily 07:00 | `POST /api/internal/daily-report` | Emails the operations summary to `OPS_ALERT_EMAIL` |
| 7 | `07-error-handler.json` | On error | `POST /api/internal/errors` | Single place where every failure is recorded and escalated |
| 8 | `08-data-quality.json` | Daily 05:00 | `POST /api/internal/data-quality` | Seven integrity checks; raises a notification on blocking issues |

## Design rules these workflows follow

- **No fabrication.** Workflow 4 records `skipped` with a reason rather than
  inventing conversions for a network whose transaction API has not been
  verified against official documentation.
- **No silent failure.** Every HTTP node has retries enabled, and every failure
  path calls workflow 07, which writes a row in `notifications` and emails
  `OPS_ALERT_EMAIL` for `error` and `critical` severities.
- **Idempotent.** Re-running an import produces zero new rows for offers that
  already exist — identity comes from `source_fingerprint`.
- **Safe by default.** If `INTERNAL_API_TOKEN` is not set in DealPass, every
  endpoint returns `401` and says so. Automation cannot accidentally run open.

## Testing without n8n

With the dev server running and `INTERNAL_API_TOKEN` set:

```bash
TOKEN=your-token-here
BASE=http://localhost:3000

curl -s -X POST -H "X-DealPass-Internal-Token: $TOKEN" "$BASE/api/internal/health"
curl -s -X POST -H "X-DealPass-Internal-Token: $TOKEN" "$BASE/api/internal/expire" | jq
curl -s -X POST -H "X-DealPass-Internal-Token: $TOKEN" \
     -H 'content-type: application/json' -d '{"limit": 5}' \
     "$BASE/api/internal/validate-links" | jq
curl -s -X POST -H "X-DealPass-Internal-Token: $TOKEN" "$BASE/api/internal/daily-report" | jq
```

The admin dashboard exposes the same actions under **Connectors** (test
connection, manual sync) and on the offer list.
