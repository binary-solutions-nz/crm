# Binary Solutions CRM

An internal dashboard for the **Binary Solutions IT Support** team to manage
clients, the services delivered to them, and — most importantly — the
**subscriptions, licenses, warranties and their renewal dates**, so upcoming
renewals never slip through the cracks.

Automated **daily reminder emails** (sent via the Microsoft Graph API to
`info@binarysolutions.co.nz` / `info@binary.kiwi`) summarise everything
renewing soon.

> This is an internal tool. There is **no public sign-up** — staff accounts are
> created manually in the Firebase console.

---

## Features

- **Clients** — individuals *or* organisations, full create/read/update/delete.
- **Per-client records:**
  - **Users** (people at an organisation)
  - **Devices / PCs** (with warranty-expiry tracking)
  - **Services** (ongoing managed services, with cost & billing cycle)
  - **Subscriptions & licenses** (vendor, seats, cost, purchase date,
    renewal/expiry date, auto-renew)
- **Dashboard** — active clients, active subscriptions, renewals due ≤30 days,
  overdue count, estimated monthly recurring revenue, and a 45-day renewal list.
- **Renewals view** — a unified, sortable timeline of every subscription and
  warranty approaching renewal, filterable by window (30/60/90/365 days).
- **Reminder emails** — a scheduled Cloud Function emails a renewals digest
  daily; staff can also trigger one on demand from the Renewals page.

## Tech stack

| Layer      | Technology                                             |
|------------|--------------------------------------------------------|
| Frontend   | React 18 + Vite + TypeScript, plain CSS                |
| Data       | Cloud Firestore                                        |
| Auth       | Firebase Authentication (email/password)               |
| Reminders  | Cloud Functions (scheduled) + Microsoft Graph API      |
| Hosting    | Firebase Hosting                                       |
| CI/CD      | GitHub Actions → `firebase deploy`                     |

## Data model (Firestore collections)

All top-level collections; child records reference their client by `clientId`.

- `clients` — `{ name, type: 'individual'|'organisation', status, email, phone, … }`
- `contacts` — org users → `{ clientId, name, role, email, phone, isPrimary }`
- `devices` — PCs → `{ clientId, hostname, type, os, serialNumber, warrantyExpiry, … }`
- `services` — `{ clientId, name, category, cost, billingCycle, status }`
- `subscriptions` — `{ clientId, name, vendor, category, seats, cost, purchaseDate, renewalDate, autoRenew, status }`
- `reminderRuns` — audit log written by the reminder function

---

## Local development

```bash
# 1. Install dependencies
npm install
npm --prefix functions install

# 2. Configure the web app
cp .env.example .env
#   → fill in VITE_FIREBASE_* from Firebase console
#     (Project settings → General → Your apps → SDK setup and configuration)

# 3. Run the dev server
npm run dev            # http://localhost:5173
```

You sign in with a Firebase Auth user you have created (see below).

---

## One-time Firebase setup

1. **Create the project** at <https://console.firebase.google.com> (suggested id
   `binary-solutions-crm`). Update `.firebaserc` if you choose a different id.
2. **Upgrade to the Blaze plan** — required for Cloud Functions and outbound
   network calls (Microsoft Graph).
3. **Enable Firestore** (Native mode).
4. **Enable Authentication → Email/Password**, then add each staff member under
   **Authentication → Users → Add user**. There is no self-service sign-up.
5. **Register a web app** in project settings and copy the config into `.env`
   (local) and into GitHub secrets (CI).

## Microsoft Graph (reminder email) setup

The reminder function sends mail *as* a real mailbox using the OAuth2
client-credentials flow.

1. In **Entra ID (Azure AD) → App registrations**, create a new registration.
2. Under **API permissions**, add **Microsoft Graph → Application permissions →
   `Mail.Send`**, then **Grant admin consent**.
3. Under **Certificates & secrets**, create a **client secret**.
4. Note the **Tenant ID**, **Client ID**, and **secret value**.
5. *(Recommended)* Scope which mailboxes the app may send from with an Exchange
   Online [`ApplicationAccessPolicy`](https://learn.microsoft.com/en-us/graph/auth-limit-mailbox-access).

Provide these to Cloud Functions:

```bash
# The client secret goes into Cloud Secret Manager (set once):
firebase functions:secrets:set GRAPH_CLIENT_SECRET

# Non-secret params — set in functions/.env for local, or via CI (below):
#   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, MAIL_SENDER, MAIL_RECIPIENTS
cp functions/.env.example functions/.env   # then edit
```

`MAIL_SENDER` must be a licensed mailbox (e.g. `info@binarysolutions.co.nz`).
`MAIL_RECIPIENTS` is comma-separated (e.g.
`info@binarysolutions.co.nz,info@binary.kiwi`).

The digest runs daily at **08:00 Pacific/Auckland** (edit `SCHEDULE_CRON` /
`SCHEDULE_TZ` in `functions/src/index.ts` to change).

---

## Deployment

### Automated (GitHub Actions)

Every push to `main` builds and deploys Hosting + Functions + Firestore rules.
Add these under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|--------|---------|
| `FIREBASE_SERVICE_ACCOUNT` | JSON key for a service account with *Firebase Admin*, *Cloud Functions Admin*, and *Service Account User* roles |
| `FIREBASE_PROJECT_ID` | e.g. `binary-solutions-crm` |
| `VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_APP_ID` | The six web-config values |
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` | Entra app registration |
| `MAIL_SENDER`, `MAIL_RECIPIENTS` | Sender + digest recipients |

> `GRAPH_CLIENT_SECRET` is **not** a GitHub secret — it lives in Cloud Secret
> Manager (`firebase functions:secrets:set GRAPH_CLIENT_SECRET`).

### Manual

```bash
npm run build
npm --prefix functions run build
npx firebase-tools deploy --only hosting,functions,firestore --project <id>
```

---

## Testing the reminder email

- Sign in, open **Renewals**, click **“Send reminder email now.”** This invokes
  the `sendRemindersNow` callable and emails the current digest immediately.
- Results (and scheduled runs) are logged to the `reminderRuns` collection and
  to `firebase functions:log`.

## Security notes

- Firestore access requires an authenticated user (`firestore.rules`). Because
  accounts are provisioned manually, every signed-in user is trusted staff.
  To add read-only roles later, introduce a `staff/{uid}` doc and check it in
  the rules.
- Firebase web config values are **not** secrets; access is controlled by Auth +
  security rules.
- Secrets that *are* sensitive (the Graph client secret, the service-account
  key) never live in the repo — they are in Secret Manager / GitHub Actions
  secrets, and `.gitignore` excludes `.env` and service-account files.
