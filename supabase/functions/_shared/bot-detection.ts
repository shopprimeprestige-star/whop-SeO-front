// Lightweight bot detection: User-Agent + known IP ranges
// Used by edge functions to filter out crawler/bot traffic and log it.

export interface BotMatch {
  isBot: boolean;
  bot_name?: string;
  reason?: string;
}

// Known bot User-Agent signatures (lowercase substring match)
const UA_SIGNATURES: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /googlebot|google-inspectiontool|adsbot-google|mediapartners-google|google-read-aloud|google-site-verification|apis-google/i, name: "Google" },
  { pattern: /bingbot|adidxbot|bingpreview|msnbot/i, name: "Bing/Microsoft" },
  { pattern: /facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|facebot/i, name: "Meta/Facebook" },
  { pattern: /tiktokspider|bytespider|bytedance/i, name: "TikTok/ByteDance" },
  { pattern: /twitterbot|x-bot/i, name: "Twitter/X" },
  { pattern: /linkedinbot/i, name: "LinkedIn" },
  { pattern: /pinterest|pinterestbot/i, name: "Pinterest" },
  { pattern: /whatsapp/i, name: "WhatsApp" },
  { pattern: /telegrambot/i, name: "Telegram" },
  { pattern: /slackbot/i, name: "Slack" },
  { pattern: /discordbot/i, name: "Discord" },
  { pattern: /applebot/i, name: "Apple" },
  { pattern: /yandex/i, name: "Yandex" },
  { pattern: /baiduspider/i, name: "Baidu" },
  { pattern: /duckduckbot|duckduckgo/i, name: "DuckDuckGo" },
  { pattern: /ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|seznambot|sogou|exabot|gigabot/i, name: "SEO Crawler" },
  { pattern: /chatgpt|gptbot|openai|claude|anthropic|perplexity|youbot|ccbot|cohere-ai/i, name: "AI Crawler" },
  { pattern: /headlesschrome|phantomjs|slimerjs|htmlunit|selenium|puppeteer|playwright/i, name: "Headless Browser" },
  { pattern: /python-requests|curl|wget|go-http-client|java\/|okhttp|axios|node-fetch|libwww/i, name: "HTTP Client" },
  { pattern: /scrapy|bot|crawler|spider|scraper|fetcher/i, name: "Generic Bot" },
];

// Known crawler IP CIDR ranges (simplified — IPv4 only, common public ranges)
// Note: Cloudflare provides cf-connecting-ip; we match against the reported origin IP.
const KNOWN_BOT_IP_PREFIXES: Array<{ prefix: string; name: string }> = [
  // Googlebot
  { prefix: "66.249.", name: "Google" },
  { prefix: "64.233.", name: "Google" },
  { prefix: "72.14.", name: "Google" },
  { prefix: "209.85.", name: "Google" },
  // Bing
  { prefix: "40.77.", name: "Bing/Microsoft" },
  { prefix: "207.46.", name: "Bing/Microsoft" },
  { prefix: "157.55.", name: "Bing/Microsoft" },
  // Meta
  { prefix: "31.13.", name: "Meta/Facebook" },
  { prefix: "66.220.", name: "Meta/Facebook" },
  { prefix: "69.63.", name: "Meta/Facebook" },
  { prefix: "69.171.", name: "Meta/Facebook" },
  { prefix: "173.252.", name: "Meta/Facebook" },
  // TikTok / ByteDance
  { prefix: "49.7.", name: "TikTok/ByteDance" },
  { prefix: "110.249.", name: "TikTok/ByteDance" },
  // Twitter
  { prefix: "199.59.", name: "Twitter/X" },
  { prefix: "199.16.", name: "Twitter/X" },
];

export function detectBot(userAgent: string | null, ip: string | null): BotMatch {
  const ua = (userAgent || "").trim();
  if (!ua) {
    return { isBot: true, bot_name: "Unknown", reason: "missing_user_agent" };
  }

  for (const sig of UA_SIGNATURES) {
    if (sig.pattern.test(ua)) {
      return { isBot: true, bot_name: sig.name, reason: "user_agent_match" };
    }
  }

  if (ip) {
    for (const range of KNOWN_BOT_IP_PREFIXES) {
      if (ip.startsWith(range.prefix)) {
        return { isBot: true, bot_name: range.name, reason: "ip_range_match" };
      }
    }
  }

  return { isBot: false };
}

export function clientIP(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}
