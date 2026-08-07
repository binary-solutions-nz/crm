// Cloud Functions entrypoint.
//
// - `dailyRenewalReminders`: scheduled digest of upcoming renewals, emailed via
//   Microsoft Graph to the configured recipients.
// - `sendRemindersNow`: authenticated callable so signed-in staff can trigger a
//   digest on demand (useful for testing the Graph configuration).
//
// Configuration is provided through Firebase Functions params. Secrets
// (GRAPH_CLIENT_SECRET) are stored in Cloud Secret Manager; set them with:
//   firebase functions:secrets:set GRAPH_CLIENT_SECRET
// Non-secret params can be set in a functions/.env file or as environment
// config. See README.md.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineString, defineInt, defineBoolean, defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { buildAndSendReminders, type ReminderConfig } from './reminders';

initializeApp();
const db = getFirestore();

// ---- Params ----------------------------------------------------------------
const GRAPH_TENANT_ID = defineString('GRAPH_TENANT_ID', { description: 'Entra ID tenant ID' });
const GRAPH_CLIENT_ID = defineString('GRAPH_CLIENT_ID', { description: 'App registration client ID' });
const GRAPH_CLIENT_SECRET = defineSecret('GRAPH_CLIENT_SECRET');
const MAIL_SENDER = defineString('MAIL_SENDER', {
  description: 'Mailbox to send from, e.g. info@binarysolutions.co.nz',
});
const MAIL_RECIPIENTS = defineString('MAIL_RECIPIENTS', {
  default: 'info@binarysolutions.co.nz',
  description: 'Comma-separated reminder recipients',
});
const REMINDER_WINDOW_DAYS = defineInt('REMINDER_WINDOW_DAYS', {
  default: 30,
  description: 'Include renewals due within this many days',
});
const INCLUDE_WARRANTIES = defineBoolean('INCLUDE_WARRANTIES', {
  default: true,
  description: 'Include device warranty expiries in the digest',
});

// The digest runs daily at 08:00 New Zealand time. Edit these constants and
// redeploy to change the cadence (they must be literal strings, not params).
const SCHEDULE_CRON = '0 8 * * *';
const SCHEDULE_TZ = 'Pacific/Auckland';

function buildConfig(): ReminderConfig {
  return {
    tenantId: GRAPH_TENANT_ID.value(),
    clientId: GRAPH_CLIENT_ID.value(),
    clientSecret: GRAPH_CLIENT_SECRET.value(),
    sender: MAIL_SENDER.value(),
    recipients: MAIL_RECIPIENTS.value()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    windowDays: REMINDER_WINDOW_DAYS.value(),
    includeWarranties: INCLUDE_WARRANTIES.value(),
  };
}

// ---- Scheduled digest ------------------------------------------------------
export const dailyRenewalReminders = onSchedule(
  {
    schedule: SCHEDULE_CRON,
    timeZone: SCHEDULE_TZ,
    secrets: [GRAPH_CLIENT_SECRET],
    region: 'australia-southeast1',
    memory: '256MiB',
  },
  async () => {
    const cfg = buildConfig();
    logger.info('Running daily renewal reminders', {
      window: cfg.windowDays,
      recipients: cfg.recipients,
    });
    try {
      const result = await buildAndSendReminders(db, cfg);
      await db.collection('reminderRuns').add({
        ranAt: Date.now(),
        trigger: 'scheduled',
        totalItems: result.totalItems,
        sent: result.sent,
        message: result.message,
      });
      logger.info('Reminder run complete', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.collection('reminderRuns').add({
        ranAt: Date.now(),
        trigger: 'scheduled',
        sent: false,
        error: message,
      });
      logger.error('Reminder run failed', { error: message });
      throw err;
    }
  }
);

// ---- Manual trigger (authenticated) ----------------------------------------
export const sendRemindersNow = onCall(
  { secrets: [GRAPH_CLIENT_SECRET], region: 'australia-southeast1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in to send reminders.');
    }
    const cfg = buildConfig();
    try {
      const result = await buildAndSendReminders(db, cfg);
      await db.collection('reminderRuns').add({
        ranAt: Date.now(),
        trigger: 'manual',
        triggeredBy: request.auth.token.email ?? request.auth.uid,
        totalItems: result.totalItems,
        sent: result.sent,
        message: result.message,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Manual reminder run failed', { error: message });
      throw new HttpsError('internal', message);
    }
  }
);
