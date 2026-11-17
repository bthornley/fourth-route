export interface PartnerConfig {
  id: 'slnt';
  layerBadge: string;
  name: string;
  handle: string;
  headline: string;
  threatVector: string;
  solutionSummary: string;
  specs: string[];
  url: string;
  /** Optional code to copy; if null/empty, discount is applied automatically via referral link */
  promoCode?: string;
  promoBoxLabel?: string;
  promoBoxValue?: string;
  seasonalNote?: string;
  offerBadge: string;
  ctaLabel: string;
  shortPillLabel: string;
  shortHeroSub: string;
  accentColor: string;
}

export const PARTNER_PROMO_CODE = 'FOURTHROUTE';
export const KOFI_URL = 'https://ko-fi.com/fourthroute';
export const INSTAGRAM_URL = 'https://instagram.com/fourthroute';
export const GITHUB_URL = 'https://github.com/bthornley/fourth-route';

/**
 * SLNT Black Friday + Cyber Monday window: Nov 18 00:00 ET (05:00Z) through
 * Nov 30 23:59 PT (Dec 1 07:59Z). Automatically reverts to standard 10% off Dec 1.
 */
function isSlntBfcmActive(now = new Date()): boolean {
  const start = Date.UTC(2026, 10, 18, 5, 0, 0);
  const end = Date.UTC(2026, 11, 1, 8, 0, 0);
  const ts = now.getTime();
  return ts >= start && ts < end;
}

const slntBfcm = isSlntBfcmActive();

export const PARTNERS: Record<'slnt', PartnerConfig> = {
  slnt: {
    id: 'slnt',
    layerBadge: 'LAYER 02 · HARDWARE SIGNAL CONTROL',
    name: 'SLNT® Signal-Blocking Gear',
    handle: '@goslnt',
    headline: 'The Analog Off Switch: Block Cellular, Wi-Fi, Bluetooth, GPS & RFID',
    threatVector:
      'Airplane mode and software privacy settings are soft switches — your phone and key fob can still connect, transmit, and be reached in the background along your commute.',
    solutionSummary:
      'SLNT® builds the physical analog off switch for modern life: patented Silent Pocket® Faraday sleeves with magnetic closure that create a brick wall for your wireless signals so your device cannot connect, track, transmit, or be reached until you choose to take it back online.',
    specs: [
      'Blocks Cellular, Wi-Fi, Bluetooth, GPS, RFID/NFC, Satellite, EMP & EMF',
      'Patented Silent Pocket® Faraday Sleeve Insert with magnetic closure',
      'Trusted by 350k+ customers & Special Operations (9 military contracts)',
    ],
    url: 'https://www.slnt.com/FOURTHROUTE',
    promoCode: 'FOURTHROUTE',
    promoBoxLabel: slntBfcm ? 'REFERRAL LINK + CODE' : '10% OFF CODE',
    promoBoxValue: 'FOURTHROUTE',
    seasonalNote: slntBfcm
      ? '🔥 Black Friday + Cyber Monday (Nov 18–30): 20% off sitewide + free gifts ($1+ Privacy Sticker · $150+ RFID Wallet · $250+ Compact Sling) applied automatically via slnt.com/FOURTHROUTE — or use code FOURTHROUTE.'
      : '✓ 10% off automatically via slnt.com/FOURTHROUTE (or code FOURTHROUTE) · Nov 18–30 BFCM: 20% off sitewide + free tiered gifts ($1+ sticker, $150+ RFID wallet, $250+ sling) via link.',
    offerBadge: slntBfcm
      ? '20% Off Sitewide + Free Gifts (Nov 18–30 via FOURTHROUTE)'
      : '10% Off via Link or Code FOURTHROUTE',
    ctaLabel: slntBfcm
      ? 'Go SLNT · Shop BFCM via Referral Link (20% Off + Free Gifts) ↗'
      : 'Go SLNT · Shop via Referral Link (10% Off) ↗',
    shortPillLabel: slntBfcm ? '📵 Go SLNT® (20% Off + Free Gifts)' : '📵 Go SLNT® (10% Off)',
    shortHeroSub: slntBfcm ? '20% Off + Free Gifts ↗' : '10% Off via Link ↗',
    accentColor: '#38bdf8',
  },
};
