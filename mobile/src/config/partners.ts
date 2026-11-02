export interface PartnerConfig {
  id: 'slnt' | 'deleteme';
  layerBadge: string;
  name: string;
  handle: string;
  headline: string;
  threatVector: string;
  solutionSummary: string;
  specs: string[];
  /**
   * Swap `url` with the final Social Snowball / Everflow tracking link
   * the moment Kaitlyn (SLNT) and Destiny (DeleteMe) send them over.
   */
  url: string;
  promoCode: string;
  offerBadge: string;
  ctaLabel: string;
  shortPillLabel: string;
  accentColor: string;
}

export const PARTNER_PROMO_CODE = 'FOURTHROUTE';
export const KOFI_URL = 'https://ko-fi.com/fourthroute';
export const INSTAGRAM_URL = 'https://instagram.com/fourthroute';
export const GITHUB_URL = 'https://github.com/bthornley/fourth-route';

export const PARTNERS: Record<'slnt' | 'deleteme', PartnerConfig> = {
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
    promoCode: PARTNER_PROMO_CODE,
    offerBadge: '10% Off · Code FOURTHROUTE',
    ctaLabel: 'Go SLNT · Claim 10% Off Faraday Gear ↗',
    shortPillLabel: '📵 Go SLNT® (10% Off)',
    accentColor: '#38bdf8',
  },
  deleteme: {
    id: 'deleteme',
    layerBadge: 'LAYER 03 · DATA BROKER & DOSSIER PURGE',
    name: 'DeleteMe',
    handle: '@deleteme',
    headline: 'Sever the License-Plate-to-Home-Address Broker Pipeline',
    threatVector:
      'Commercial ALPR networks (DRN, Vigilant, repo spotters) cross-reference plate scans against commercial data brokers (LexisNexis, BeenVerified, Spokeo, Whitepages) to link your vehicle directly to your home address, phone number, relatives, and workplace.',
    solutionSummary:
      'DeleteMe continuously audits and submits formal opt-out removals across 500+ commercial data brokers, stripping your home address, phone numbers, property records, and family associations out of public and commercial lookup pipelines.',
    specs: [
      'Continuous automated + human removals across 500+ data brokers',
      'Breaks the public lookup chain between your name, phone & home address',
      'Quarterly privacy audit reports verifying broker removal status',
    ],
    url: 'https://joindeleteme.com',
    promoCode: PARTNER_PROMO_CODE,
    offerBadge: '20% Off · Code FOURTHROUTE',
    ctaLabel: 'Purge Data Brokers with DeleteMe ↗',
    shortPillLabel: '🧹 DeleteMe Purge',
    accentColor: '#4ade80',
  },
};
