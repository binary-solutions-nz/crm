// Microsoft Graph email sender using the OAuth2 client-credentials flow.
//
// Requires an Entra ID (Azure AD) app registration with the APPLICATION
// permission `Mail.Send` (admin-consented). The app sends "as" the mailbox
// given in MAIL_SENDER (e.g. info@binarysolutions.co.nz), which must be a
// real, licensed mailbox in the tenant.
//
// To limit which mailboxes the app can send from, configure an Exchange
// Online ApplicationAccessPolicy for the app registration.

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(cfg: GraphConfig): Promise<string> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(
    cfg.tenantId
  )}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph token request failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as TokenResponse;
  return json.access_token;
}

export interface SendMailArgs {
  subject: string;
  html: string;
  to: string[];
}

export async function sendGraphMail(cfg: GraphConfig, args: SendMailArgs): Promise<void> {
  const recipients = args.to
    .map((addr) => addr.trim())
    .filter(Boolean)
    .map((addr) => ({ emailAddress: { address: addr } }));

  if (recipients.length === 0) {
    throw new Error('No recipients configured for reminder email (MAIL_RECIPIENTS is empty).');
  }

  const token = await getAccessToken(cfg);

  const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    cfg.sender
  )}/sendMail`;

  const payload = {
    message: {
      subject: args.subject,
      body: { contentType: 'HTML', content: args.html },
      toRecipients: recipients,
    },
    saveToSentItems: true,
  };

  const res = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // Graph sendMail returns 202 Accepted with an empty body on success.
  if (res.status !== 202) {
    const text = await res.text();
    throw new Error(`Graph sendMail failed (${res.status}): ${text}`);
  }
}
