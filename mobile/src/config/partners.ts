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
    layerBadge: 'LAYER 02 · HARDWARE RF & CELLULAR ISOLATION',
    name: 'SLNT® Faraday Gear',
    handle: '@goslnt',
    headline: 'Go Invisible to Cellular IMSI Catchers, GPS & BLE Sniffers',
    threatVector:
      'Bypassing optical ALPR cameras stops plate scans — but roadside Stingrays (IMSI catchers), municipal Wi-Fi/Bluetooth MAC sniffers, and 315/433 MHz key-fob relay scanners still ping your phone and vehicle hardware.',
    solutionSummary:
      'Patented Silent Pocket® Faraday cages provide instant -100 dB MIL-STD-188-125-2 electromagnetic attenuation, physically severing cellular, GPS, Wi-Fi, Bluetooth, RFID, and key-fob telemetry without trusting software "Airplane Mode."',
    specs: [
      '-100 dB RF attenuation (400 MHz – 40 GHz)',
      'Blocks 5G/LTE IMSI catchers, GPS, Wi-Fi & Bluetooth MAC probes',
      'Stops relay-attack key-fob cloning & vehicle telemetry pings',
    ],
    url: 'https://slnt.com',
    promoCode: PARTNER_PROMO_CODE,
    offerBadge: 'Code FOURTHROUTE',
    ctaLabel: 'Explore SLNT® Faraday Sleeves ↗',
    shortPillLabel: '📵 SLNT Faraday',
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
