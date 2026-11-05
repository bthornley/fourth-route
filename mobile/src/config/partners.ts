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
  accentColor: string;
}

export const PARTNER_PROMO_CODE = 'FOURTHROUTE';
export const KOFI_URL = 'https://ko-fi.com/fourthroute';
export const INSTAGRAM_URL = 'https://instagram.com/fourthroute';
export const GITHUB_URL = 'https://github.com/bthornley/fourth-route';

/**
 * Automatically returns SLNT's active November 2026 promotion details
 * while always routing clicks through https://www.slnt.com/FOURTHROUTE
 * so the Social Snowball affiliate cookie is set first.
 */
function getSlntDynamicPromo(): {
  offerBadge: string;
  promoBoxLabel: string;
  promoBoxValue: string;
  promoCode: string;
  seasonalNote: string;
} {
  const now = new Date();
  const month = now.getMonth(); // 10 = November (0-indexed)
  const day = now.getDate();

  if (month === 10 && day >= 1 && day <= 7) {
    return {
      offerBadge: '10% Off via Link · Or BOGO 30% Off (DOUBLEUP)',
      promoBoxLabel: 'NOV 1–7 DEAL CODE',
      promoBoxValue: 'DOUBLEUP',
      promoCode: 'DOUBLEUP',
      seasonalNote:
        '🔥 Nov 1–7 Double Up Event: Click our referral link for 10% off automatically — OR buy one Faraday Phone Sleeve and get the 2nd 30% off with code DOUBLEUP at checkout!',
    };
  }
  if (month === 10 && day >= 8 && day <= 17) {
    return {
      offerBadge: '10% Off via Link · Or 25% Off Bundles (BUNDLE)',
      promoBoxLabel: 'NOV 8–17 BUNDLE CODE',
      promoBoxValue: 'BUNDLE',
      promoCode: 'BUNDLE',
      seasonalNote:
        '🔥 Nov 8–17 Faraday Bundles Event: Click our referral link for 10% off sitewide — OR save 25% on curated signal-blocking bundles with code BUNDLE at checkout!',
    };
  }
  if (month === 10 && day >= 18 && day <= 30) {
    return {
      offerBadge: '20% Off Sitewide + Free Gift (BLACKFRIDAY)',
      promoBoxLabel: 'NOV 18–30 BFCM CODE',
      promoBoxValue: 'BLACKFRIDAY',
      promoCode: 'BLACKFRIDAY',
      seasonalNote:
        '🔥 Black Friday + Cyber Monday (Nov 18–30): Click our referral link and use code BLACKFRIDAY for 20% off sitewide + a Free Card Wallet ($150+) or Free Compact Faraday Sling ($250+)!',
    };
  }

  return {
    offerBadge: '10% Off Auto-Applied via Link',
    promoBoxLabel: 'REFERRAL LINK PERK',
    promoBoxValue: '10% OFF LINK',
    promoCode: 'https://www.slnt.com/FOURTHROUTE',
    seasonalNote:
      '✓ 10% off is automatically gifted when you shop through our referral link (slnt.com/FOURTHROUTE).',
  };
}

const slntPromo = getSlntDynamicPromo();

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
    promoCode: slntPromo.promoCode,
    promoBoxLabel: slntPromo.promoBoxLabel,
    promoBoxValue: slntPromo.promoBoxValue,
    seasonalNote: slntPromo.seasonalNote,
    offerBadge: slntPromo.offerBadge,
    ctaLabel: 'Go SLNT · Shop via Referral Link (10% Off) ↗',
    shortPillLabel: '📵 Go SLNT® (10% Off)',
    accentColor: '#38bdf8',
  },
};
