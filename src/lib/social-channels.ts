// Social media-kanalen van HHC Hardenberg. De links zelf staan in de database
// (tabel social_channels) en stelt een beheerder van Communicatie in via
// Beheer > Social media. Een kanaal zonder link wordt niet getoond.

export const SOCIAL_PLATFORMS = ["facebook", "instagram", "x", "youtube", "tiktok", "linkedin", "whatsapp"] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp-kanaal",
};

export const SOCIAL_PLATFORM_PLACEHOLDERS: Record<SocialPlatform, string> = {
  facebook: "https://www.facebook.com/...",
  instagram: "https://www.instagram.com/...",
  x: "https://x.com/...",
  youtube: "https://www.youtube.com/@...",
  tiktok: "https://www.tiktok.com/@...",
  linkedin: "https://www.linkedin.com/company/...",
  whatsapp: "https://whatsapp.com/channel/...",
};

export interface SocialChannel {
  platform: SocialPlatform;
  url: string;
}

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/**
 * Maakt van invoer een nette https-link, of geeft null terug als het geen geldige link is.
 * "www.facebook.com/hhc" wordt "https://www.facebook.com/hhc"; http wordt https.
 */
export function normalizeSocialUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 500) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
  return url.toString();
}

/** Zet de kanalen in de vaste volgorde van SOCIAL_PLATFORMS. */
export function sortSocialChannels(channels: SocialChannel[]): SocialChannel[] {
  return [...channels].sort((a, b) => SOCIAL_PLATFORMS.indexOf(a.platform) - SOCIAL_PLATFORMS.indexOf(b.platform));
}
