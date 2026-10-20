/**
 * Output guardrails for AI replies (Human-in-the-loop enforcement).
 *
 * The model is told it is a read-only advisor. These checks make sure a reply
 * that breaks that contract never reaches a stressed business owner: if any
 * rule trips, the caller swaps in the deterministic playbook text instead.
 */

// Double quotes only: single quotes collide with apostrophes ("Don't ... I've").
const stripQuoted = (text) => text.replace(/["“][^"”\n]{1,80}["”]/g, '""');

const RULES = [
  {
    id: 'claims-action',
    // "I've blocked the IP", "We have disconnected your PC" - the AI can't do that.
    // Quoted button labels such as "I unplugged it" are the user's words, so skip them.
    test: (text) => {
      const unquoted = stripQuoted(text);
      return (
        /\b(?:I|I've|I have|I'm|we|we've|we have)\s+(?:now\s+|just\s+|already\s+|successfully\s+)?(?:blocked|disconnected|isolated|unplugged|deleted|removed|shut down|turned off|changed|reset|enabled|disabled|quarantined|fixed|restored|locked|blocking|disconnecting|isolating)\b/i.test(
          unquoted,
        ) ||
        // Bahasa Melayu: "Saya telah menyekat...", "Kami sudah memutuskan..."
        /\b(?:saya|kami)\s+(?:sudah|telah|dah|baru|berjaya)\s+(?:menyekat|sekat|memutuskan|putuskan|mencabut|cabut|memadam|padam|mematikan|matikan|menukar|tukar|menetapkan semula|mengasingkan|asingkan|membaiki|baiki|memulihkan|pulihkan|mengunci|kunci|mengkuarantin)\b/i.test(
          unquoted,
        )
      );
    },
  },
  {
    id: 'asks-for-secret',
    test: (text) =>
      /\b(?:send|tell|share|give|paste|type)\s+(?:me|us)\b[^.?!]{0,40}\b(?:password|passcode|otp|pin|tac|code|card|cvv|bank)/i.test(text) ||
      /\b(?:password|passcode|otp|one[- ]time code|pin|card number|cvv|tac)\b[^.?!]{0,40}\b(?:to me|with me|in this chat|in the chat|here in the chat)\b/i.test(text) ||
      /\b(?:hantar|beritahu|berikan|beri|kongsi|taip)(?:kan)?\s+(?:kepada\s+)?(?:saya|kami)\b[^.?!]{0,40}\b(?:kata laluan|otp|tac|pin|kod|nombor kad|cvv|akaun bank)/i.test(text) ||
      /\b(?:kata laluan|otp|tac|pin|nombor kad|cvv)\b[^.?!]{0,40}\b(?:kepada saya|dengan saya|dalam chat|dalam sembang|di sini)\b/i.test(text),
  },
  {
    id: 'pay-ransom',
    test: (text) => {
      // English and Bahasa Melayu ("bayar wang tebusan"); allowed only when negated.
      const patterns = [
        { re: /\bpay(?:ing)?\s+(?:the\s+|them\s+(?:the\s+)?)?ransom\b/gi, negation: /\b(?:not|n't|never|avoid|before)\b/ },
        { re: /\bbayar(?:lah)?\s+(?:wang\s+)?tebusan\b/gi, negation: /\b(?:jangan|tidak|usah|tak|sebelum|elakkan)\b/ },
      ];
      for (const { re, negation } of patterns) {
        let match;
        while ((match = re.exec(text))) {
          const before = text.slice(Math.max(0, match.index - 25), match.index).toLowerCase();
          if (!negation.test(before)) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'technical-commands',
    // Non-technical users must never be told to run commands.
    test: (text) => /```|\b(?:powershell|cmd\.exe|sudo|netsh|iptables|regedit|bash|terminal command)\b/i.test(text),
  },
];

const URL_RE = /\bhttps?:\/\/[^\s)>\]]+/gi;

/**
 * @param {string} text   model reply
 * @param {string[]} allowedUrls  URLs the playbook itself provides
 * @returns {{ ok: boolean, violations: string[] }}
 */
function check(text, allowedUrls = []) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, violations: ['empty'] };

  const violations = RULES.filter((rule) => rule.test(text)).map((rule) => rule.id);

  const allowed = allowedUrls.map((url) => url.replace(/\/+$/, '').toLowerCase());
  const unknownLinks = (text.match(URL_RE) || []).filter(
    (url) => !allowed.some((ok) => url.replace(/[.,;:]+$/, '').toLowerCase().startsWith(ok)),
  );
  if (unknownLinks.length) violations.push('unvetted-link');

  return { ok: violations.length === 0, violations };
}

module.exports = { check };
