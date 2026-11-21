export interface PartnerEcosystemBreakdown {
  fusionCenters: string[];
  federalPartners: string[];
  insuranceAndState: string[];
}

const FUSION_RE = /\b(?:fusion center|hidta|intelligence center|intel center|rtcc|real[- ]time crime)\b/i;
const FEDERAL_RE =
  /^\[federal\]|\b(?:fbi|federal bureau|u\.?s\.?\s*marshals?|secret service|homeland security|dhs|atf|dea|park police|postal inspection|veterans affairs|gsa office|air force|border patrol|ice)\b/i;
const INSURANCE_STATE_RE =
  /\b(?:commissioner of insurance|insurance fraud|nicb|national insurance crime|highway patrol|state police|department of revenue|dmv)\b/i;

export function classifySharingPartners(partners?: string[] | null): PartnerEcosystemBreakdown {
  const list = Array.isArray(partners) ? partners.filter(Boolean) : [];
  const fusionCenters: string[] = [];
  const federalPartners: string[] = [];
  const insuranceAndState: string[] = [];

  for (const name of list) {
    if (FUSION_RE.test(name)) fusionCenters.push(name);
    if (FEDERAL_RE.test(name)) federalPartners.push(name);
    if (INSURANCE_STATE_RE.test(name)) insuranceAndState.push(name);
  }

  return { fusionCenters, federalPartners, insuranceAndState };
}

export interface VendorEcosystemNote {
  label: string;
  tone: 'warn' | 'info' | 'neutral';
  detail: string;
}

export function getVendorEcosystemNote(
  operator?: string | null,
  ownerType?: string | null
): VendorEcosystemNote | null {
  const op = (operator || '').trim();

  if (/\b(?:motorola|vigilant|drn)\b/i.test(op)) {
    return {
      label: 'Motorola / Vigilant Family',
      tone: 'warn',
      detail:
        'Motorola Solutions owns both Vigilant (law-enforcement NVLS) and sister commercial company DRN, whose private sighting feeds are sold to insurers and data brokers.',
    };
  }

  if (ownerType === 'private' || /\b(?:lowe'?s|home depot|walmart|target|hoa|mall|simon)\b/i.test(op)) {
    return {
      label: 'Private / Commercial Node',
      tone: 'warn',
      detail:
        'Private commercial or HOA cameras operate outside municipal transparency portals, public FOIA laws, and statutory police retention caps.',
    };
  }

  if (/\brekor\b/i.test(op)) {
    return {
      label: 'Rekor Commercial Network',
      tone: 'info',
      detail:
        'Commercial LPR vendor supplying roadside, tolling, insurance verification, and municipal deployments.',
    };
  }

  return null;
}
