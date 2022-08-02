import { differenceInMinutes } from "date-fns";
import { last } from "lodash";
import { CarConfig, CarPowerSourceResultV2, ChargingConfig, ChargingEntry, ConsumptionEntry, ConsumptionJourney, Journey, JourneyEntry, Location, Parking, TimelineObject } from "./types";

function findNext(timelineObjects: TimelineObject[], currentIndex: number) {
  for (let i = currentIndex; i >= 0; i--) {
    if (timelineObjects[i].placeVisit) {
      return timelineObjects[i].placeVisit;
    }
  }

  return null;
}

function findPrevious(timelineObjects: TimelineObject[], currentIndex: number) {
  for (let i = currentIndex; i < timelineObjects.length; i++) {
    if (timelineObjects[i].placeVisit) {
      return        timelineObjects[i].placeVisit;
    }
  }

  return null;
}

function isDefined<X>(x: X | null): x is X {
  return !!x;
}

function getJourneys(input: TimelineObject[]): Journey[] {
  return input.map((entry, i) => {
    if (entry.activitySegment) {
      if ((entry.activitySegment.waypointPath && entry.activitySegment.waypointPath.travelMode === "DRIVE") || entry.activitySegment.activityType === "IN_PASSENGER_VEHICLE") {
        const fromLocation = findNext(input, i);
        const toLocation = findPrevious(input, i);

        return {
          // waypointPath.distanceMeters is more accurate but it does not exists for every journey
          distanceKm: (entry.activitySegment.waypointPath ? entry.activitySegment.waypointPath.distanceMeters : entry.activitySegment.distance) / 1000,
          startTimestamp: new Date(
            entry.activitySegment.duration.startTimestamp
          ),
          endTimestamp: new Date(entry.activitySegment.duration.endTimestamp),
          from: fromLocation ? { name: fromLocation.location.name, address: fromLocation.location.address } : null,
            to: toLocation  ? { name: toLocation.location.name, address: toLocation.location.address } : null,
        };
      }
    }
    return null;
  }).filter(isDefined)
}

function getJourneyEntries(journeys: Journey[]): JourneyEntry[] {
  return journeys.flatMap((journey, i) => {
    if (journeys.length - 1 === i) {
      return [{type: 'journey', journey}];
    }
    if (journey.to === null) {
      return [{type: 'journey', journey}];
    }

    const nextJourney = journeys[i + 1];
    const parkingDuration = differenceInMinutes(nextJourney.startTimestamp, journey.endTimestamp);

    const confidence = journey.to?.address !== nextJourney.from?.address ? 'low' : 'high'
    
    return [{type: 'journey', journey}, { type: 'parking', parking: { durationMinutes: parkingDuration, location: journey.to, confidence } }]});
}

function getConsumptionJourney(journey: Journey, config: CarConfig, batteryLeft: number): ConsumptionJourney {
  const batteryUsage =
          (journey.distanceKm / 100) *
          config.carElectricityConsumptionKWhPer100Km;
        if (batteryUsage > batteryLeft) {
          // ran out of battery, thus actual electric consumption is only the batteryLeft value
          // console.log(`Ran out of battery (demand ${batteryUsage} kWh)`);
          const electricKms =
            (batteryLeft / config.carElectricityConsumptionKWhPer100Km) * 100;
          const electricConsumption = batteryLeft;
          batteryLeft = 0;
          const petrolKms = journey.distanceKm - electricKms;
          const petrolConsumption =
            (petrolKms / 100) * config.carPetrolConsumptionLPer100Km;
          return {
            ...journey,
            electricConsumption,
            petrolConsumption,
            electricDistance: electricKms,
            petrolDistance: petrolKms,
            batteryLeftKWhAfter: 0,
          };
        } else {
          // console.log(
          //  `Drove full electric (distance ${journey.distanceKm}, demand ${batteryUsage} kWh)`
          // );
          const electricKms =
            (batteryUsage / config.carElectricityConsumptionKWhPer100Km) * 100;
          const electricConsumption = batteryUsage;
          batteryLeft = batteryLeft - batteryUsage;
          return {
            ...journey,
            electricConsumption,
            petrolConsumption: 0,
            electricDistance: electricKms,
            petrolDistance: 0,
            batteryLeftKWhAfter: batteryLeft,
          };
        }
}

function getChargingPower(location: Location, config: CarConfig, chargingConfig: ChargingConfig): number {
  const configEntry = chargingConfig[location.address] || (location.name ? chargingConfig[location.name] : undefined);
  if (!configEntry) {
    return 0;
  }

  return Math.min(config.carMaxChargingPower, configEntry);
}

function getChargingEntry(parking: Parking, config: CarConfig, chargingConfig: ChargingConfig, batteryLeft: number): ChargingEntry {
  const chargingTimeMinutes = Math.max(0, parking.durationMinutes - 5);
  const maxCharged = config.carElectricBatteryKWh - batteryLeft;
  const chargingPower = getChargingPower(parking.location, config, chargingConfig);
  const charged = Math.min(maxCharged, chargingPower * chargingTimeMinutes / 60);
  return {
    ...parking,
    chargedKWh: charged,
    batteryLeftKWhAfter: batteryLeft + charged,
    chargingPower,
    chargingDurationMinutes: chargingTimeMinutes,
  }
}

function getBatteryLeft(lastEntry: ConsumptionEntry | undefined) {
  if (!lastEntry) {
    return 0;
  }
  return lastEntry.type === 'journey' ? lastEntry.journey.batteryLeftKWhAfter : lastEntry.parking.batteryLeftKWhAfter;
}

function getConsumptionEntry(journeyEntry: JourneyEntry, previousConsumptionEntry: ConsumptionEntry | undefined, config: CarConfig, chargingConfig: ChargingConfig): ConsumptionEntry {
  return journeyEntry.type === 'journey' ? {type: 'journey', journey: getConsumptionJourney(journeyEntry.journey, config, previousConsumptionEntry ? getBatteryLeft(previousConsumptionEntry) : config.carElectricBatteryKWh)} : 
    { type: 'parking', parking: getChargingEntry(journeyEntry.parking, config, chargingConfig, previousConsumptionEntry ? getBatteryLeft(previousConsumptionEntry) : config.carElectricBatteryKWh) }
}

function getConsumptionEntries(journeyEntries: JourneyEntry[], config: CarConfig, chargingConfig: ChargingConfig): ConsumptionEntry[] {
  if (journeyEntries.length === 0) {
    return [];
  }
  const [first, ...rest] = journeyEntries;
  const firstConsumptionEntry: ConsumptionEntry = getConsumptionEntry(first, undefined, config, chargingConfig);
  return rest.reduce((prev, curr) => [...prev, getConsumptionEntry(curr, last(prev), config, chargingConfig)], [firstConsumptionEntry])
}

export function calculatePowerSourceResult(
  input: TimelineObject[],
  config: CarConfig,
  chargingConfig: ChargingConfig,
): CarPowerSourceResultV2 {
  const journeys = getJourneys(input);
  const journeyEntries = getJourneyEntries(journeys);
  const consumptionEntries = getConsumptionEntries(journeyEntries, config, chargingConfig);

  return {entries: consumptionEntries};
}