/**
 * Fuel economy calculations for route comparison.
 * Estimates cost and CO2 savings based on miles saved.
 */

export type VehicleType = 'gas_avg' | 'gas_efficient' | 'suv' | 'hybrid' | 'ev';

export interface VehicleProfile {
  label: string;
  emoji: string;
  mpg?: number;           // gas vehicles
  milesPerKwh?: number;   // EVs
  isEV: boolean;
}

export const VEHICLE_PROFILES: Record<VehicleType, VehicleProfile> = {
  gas_avg:       { label: 'Gas (avg)',       emoji: '⛽', mpg: 28,   isEV: false },
  gas_efficient: { label: 'Gas (efficient)', emoji: '⛽', mpg: 38,   isEV: false },
  suv:           { label: 'SUV / Truck',     emoji: '🛻', mpg: 20,   isEV: false },
  hybrid:        { label: 'Hybrid',          emoji: '🔋', mpg: 50,   isEV: false },
  ev:            { label: 'Electric',        emoji: '⚡', milesPerKwh: 3.5, isEV: true },
};

// California averages (update periodically)
const GAS_PRICE_PER_GAL  = 4.55;   // USD, CA avg regular
const ELEC_PRICE_PER_KWH = 0.30;   // USD, CA avg residential

// EPA: 1 gallon gasoline = 8.887 kg CO2
const KG_CO2_PER_GALLON = 8.887;
// EIA: US grid avg ≈ 0.386 kg CO2/kWh; CA grid is cleaner ≈ 0.21 kg/kWh
const KG_CO2_PER_KWH = 0.21;

export interface FuelSavings {
  milesSaved: number;
  dollarsaved: number;
  co2SavedKg: number;
  unit: 'gallons' | 'kWh';
  unitsaved: number;
  gasPrice: number;
  elecPrice: number;
  isEV: boolean;
}

/**
 * Calculate fuel/energy savings when the privacy route is shorter.
 * Returns null if privacy route is longer (no savings to show).
 */
export function calcFuelSavings(
  privacyMiles: number,
  standardMiles: number,
  vehicle: VehicleType,
): FuelSavings | null {
  const milesSaved = standardMiles - privacyMiles;
  if (milesSaved <= 0.01) return null;  // no meaningful savings

  const profile = VEHICLE_PROFILES[vehicle];

  if (profile.isEV) {
    const kwhSaved = milesSaved / profile.milesPerKwh!;
    return {
      milesSaved,
      dollarsaved: kwhSaved * ELEC_PRICE_PER_KWH,
      co2SavedKg: kwhSaved * KG_CO2_PER_KWH,
      unit: 'kWh',
      unitsaved: kwhSaved,
      gasPrice: GAS_PRICE_PER_GAL,
      elecPrice: ELEC_PRICE_PER_KWH,
      isEV: true,
    };
  } else {
    const gallonsSaved = milesSaved / profile.mpg!;
    return {
      milesSaved,
      dollarsaved: gallonsSaved * GAS_PRICE_PER_GAL,
      co2SavedKg: gallonsSaved * KG_CO2_PER_GALLON,
      unit: 'gallons',
      unitsaved: gallonsSaved,
      gasPrice: GAS_PRICE_PER_GAL,
      elecPrice: ELEC_PRICE_PER_KWH,
      isEV: false,
    };
  }
}

/** Annualise savings assuming this trip is made N times per year */
export function annualiseSavings(savings: FuelSavings, tripsPerYear: number) {
  return {
    dollarsPerYear: savings.dollarsaved * tripsPerYear,
    co2KgPerYear:   savings.co2SavedKg * tripsPerYear,
    milesPerYear:   savings.milesSaved * tripsPerYear,
  };
}
