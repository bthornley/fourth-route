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
    promoBoxLabel: '10% OFF CODE',
    promoBoxValue: 'FOURTHROUTE',
    seasonalNote:
      '✓ 10% off is automatically applied when you shop via slnt.com/FOURTHROUTE — or enter code FOURTHROUTE at checkout.',
    offerBadge: '10% Off via Link or Code FOURTHROUTE',
    ctaLabel: 'Go SLNT · Shop via Referral Link (10% Off) ↗',
    shortPillLabel: '📵 Go SLNT® (10% Off)',
    accentColor: '#38bdf8',
  },
};
