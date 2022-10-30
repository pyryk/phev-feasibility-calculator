export type TimelineActivityObject = {
  activitySegment: {
    startLocation: {
      latitudeE7: number;
      longitudeE7: number;
      sourceInfo: {
        deviceTag: number;
      };
    };
    endLocation: {
      latitudeE7: number;
      longitudeE7: number;
      sourceInfo: {
        deviceTag: number;
      };
    };
    duration: {
      startTimestamp: string;
      endTimestamp: string;
    };
    distance: number;
    activityType: string;
    confidence: string;
    activities: Array<{
      activityType: string;
      probability: number;
    }>;
    waypointPath?: {
      waypoints: Array<{
        latE7: number;
        lngE7: number;
      }>;
      source: string;
      distanceMeters?: number;
      travelMode: string;
      confidence: number;
    };
    simplifiedRawPath?: {
      distanceMeters?: number;
      points: Array<{
        accuracyMeters: number;
        latE7: number;
        lngE7: number;
        timestamp: string;
      }>;
      source: string;
    };
  };
  placeVisit: undefined;
};

export type TimelinePlaceVisitObject = {
  activitySegment: undefined;
  placeVisit: {
    location: {
      latitudeE7: number;
      longitudeE7: number;
      placeId: string;
      address: string;
      name: string;
      sourceInfo: {
        deviceTag: number;
      };
      locationConfidence: number;
      calibratedProbability: number;
    };
    duration: {
      startTimestamp: string;
      endTimestamp: string;
    };
    placeConfidence: string;
    centerLatE7: number;
    centerLngE7: number;
    visitConfidence: number;
    otherCandidateLocations: Array<{
      latitudeE7: number;
      longitudeE7: number;
      placeId: string;
      address: string;
      name: string;
      locationConfidence: number;
      calibratedProbability: number;
    }>;
    editConfirmationStatus: string;
    locationConfidence: number;
    placeVisitType: string;
    placeVisitImportance: string;
  };
};

export type TimelineObject = TimelineActivityObject | TimelinePlaceVisitObject;

export type Journey = {
  distanceKm: number;
  startTimestamp: Date;
  endTimestamp: Date;
  from: Location | null;
  to: Location | null;
};

export type Location = {
  name?: string;
  address: string;
};

export type Parking = {
  location: Location;
  durationMinutes: number;
  confidence: "high" | "low";
};

export type JourneyEntry =
  | { type: "journey"; journey: Journey }
  | { type: "parking"; parking: Parking };

export type ConsumptionJourney = Journey & {
  electricDistance: number;
  electricConsumption: number;
  otherFuelDistance: number;
  otherFuelConsumption: number;
  batteryLeftKWhAfter: number;
};

export type ChargingEntry = Parking & {
  chargingPower: number;
  chargingDurationMinutes: number;
  chargedKWh: number;
  batteryLeftKWhAfter: number;
};

export type ConsumptionParkingEntry = {
  type: "parking";
  parking: ChargingEntry;
};

export type ConsumptionJourneyEntry = {
  type: "journey";
  journey: ConsumptionJourney;
};

export type ConsumptionEntry =
  | ConsumptionParkingEntry
  | ConsumptionJourneyEntry;

export type CarPowerSourceResultV2 = {
  entries: ConsumptionEntry[];
};

export type CarPowerSourceResult = {
  journeys: ConsumptionJourney[];
};

export type CarConsumptionMap = {
  50: number;
  80: number;
  100: number;
  120: number;
};

export type CarConfig = {
  version: number;
  isBEV: boolean;
  petrolPriceEuroPerLiter: number;
  electricityPriceEuroPerKWh: number;
  carElectricBatteryKWh: number;
  carPetrolConsumptionLPer100Km: number;
  carMaxChargingPower: number;
  distanceInaccuracyCoefficient: number;
  carElectricityConsumptionKWhPer100kmAt: CarConsumptionMap;
};

export type ChargingConfig = { [locationName: string]: number };

export type TemperatureConfig = {
  0: number;
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  7: number;
  8: number;
  9: number;
  10: number;
  11: number;
};

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type Month = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
