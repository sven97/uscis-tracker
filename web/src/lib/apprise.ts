/** Friendly, credential-safe presentation of an Apprise URL. */

const TYPE_BY_SCHEME: Record<string, string> = {
  mailto: "Email",
  mailtos: "Email",
  tgram: "Telegram",
  telegram: "Telegram",
  ntfy: "ntfy",
  ntfys: "ntfy",
  discord: "Discord",
  slack: "Slack",
  gotify: "Gotify",
  gotifys: "Gotify",
  matrix: "Matrix",
  matrixs: "Matrix",
  pover: "Pushover",
  pbul: "Pushbullet",
  json: "Webhook",
  jsons: "Webhook",
  form: "Webhook",
  forms: "Webhook",
  xml: "Webhook",
};

/** `scheme://…` — used to validate an added URL and to pick an icon/label. */
export function appriseScheme(url: string): string | null {
  return url.trim().match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase() ?? null;
}

export function looksLikeAppriseUrl(url: string): boolean {
  return appriseScheme(url) !== null;
}

/** Hide passwords / bare tokens so a URL is safe to show in the list. */
function maskSecrets(url: string): string {
  return (
    url
      // user:password@  →  user:•••@
      .replace(/(:\/\/[^:@/\s]+):[^@/\s]+@/, "$1:•••@")
      // bare token as the host (tgram://<token>/…, ntfy://…, gotify://host/<token>)
      .replace(/(:\/\/)([^/@:\s]{8,})(?=[/?]|$)/, (_m, p: string, tok: string) =>
        p + tok.slice(0, 4) + "•••",
      )
  );
}

export function describeChannel(url: string): { type: string; summary: string } {
  const scheme = appriseScheme(url);
  const type = scheme ? (TYPE_BY_SCHEME[scheme] ?? scheme.toUpperCase()) : "Channel";

  let summary = maskSecrets(url.trim());
  if (scheme?.startsWith("mailto")) {
    // Prefer the recipient address for email channels.
    const to = url.match(/[?&]to=([^&\s]+)/i)?.[1];
    if (to) summary = decodeURIComponent(to);
  }
  return { type, summary };
}
