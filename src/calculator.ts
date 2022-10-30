import { differenceInMinutes, getHours, getMonth } from "date-fns";
import { last, maxBy, minBy } from "lodash";
import {
  CarConfig,
  CarPowerSourceResultV2,
  ChargingConfig,
  ChargingEntry,
  ConsumptionEntry,
  ConsumptionJourney,
  Journey,
  JourneyEntry,
  Location,
  Month,
  Parking,
  TemperatureConfig,
  TimelineActivityObject,
  TimelineObject,
} from "./types";

// based on  https://docs.google.com/spreadsheets/d/1k1DOw-NwvW8E8tQeXlacnt201fNc5qZyAPC0_vnoFBw/edit#gid=966823742
const temperatureEfficiencyPercentages = {
  "-25": 46.0,
  "-24": 46.5,
  "-23": 47.0,
  "-22": 47.5,
  "-21": 48.0,
  "-20": 49.0,
  "-19": 50.0,
  "-18": 51.0,
  "-17": 52.0,
  "-16": 53.0,
  "-15": 54.0,
  "-14": 55.0,
  "-13": 56.0,
  "-12": 57.5,
  "-11": 59.0,
  "-10": 60.0,
  "-9": 62.0,
  "-8": 64.0,
  "-7": 66.0,
  "-6": 68.0,
  "-5": 70.0,
  "-4": 72.0,
  "-3": 74.0,
  "-2": 76.0,
  "-1": 78.0,
  "0": 80.0,
  "1": 82.0,
  "2": 84.0,
  "3": 86.0,
  "4": 88.0,
  "5": 90.0,
  "6": 92.0,
  "7": 94.0,
  "8": 96.0,
  "9": 98.0,
  "10": 100.0,
  "11": 102.0,
  "12": 104.0,
  "13": 106.0,
  "14": 108.0,
  "15": 110.0,
  "16": 111.0,
  "17": 112.0,
  "18": 113.0,
  "19": 114.0,
  "20": 115.0,
  "21": 115.0,
  "22": 114.0,
  "23": 113.0,
  "24": 112.0,
  "25": 111.0,
  "26": 109.5,
  "27": 108.5,
  "28": 107.0,
  "29": 106.0,
  "30": 105.0,
  "31": 103.0,
  "32": 101.0,
  "33": 99.0,
  "34": 97.0,
  "35": 94.0,
  "36": 91.0,
  "37": 88.0,
  "38": 85.0,
  "39": 82.0,
  "40": 79.0,
};

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
      return timelineObjects[i].placeVisit;
    }
  }

  return null;
}

function isDefined<X>(x: X | null): x is X {
  return !!x;
}

function getJourneyDistanceMeters(entry: TimelineActivityObject): number {
  // waypointPath distance seems to be the most accurate -- use it if it exists
  if (entry.activitySegment.waypointPath?.distanceMeters) {
    return entry.activitySegment.waypointPath.distanceMeters;
  }
  // sometimes waypointPath does not exists -- try to use simplifiedRawPath in those cases
  if (entry.activitySegment.simplifiedRawPath?.distanceMeters) {
    return entry.activitySegment.simplifiedRawPath.distanceMeters;
  }

  // this seems to be less accurate but it is the only distance that exists for older journeys
  return entry.activitySegment.distance;
}

function getJourneys(input: TimelineObject[]): Journey[] {
  return input
    .map((entry, i) => {
      if (entry.activitySegment) {
        if (
          (entry.activitySegment.waypointPath &&
            entry.activitySegment.waypointPath.travelMode === "DRIVE") ||
          entry.activitySegment.activityType === "IN_PASSENGER_VEHICLE"
        ) {
          const fromLocation = findNext(input, i);
          const toLocation = findPrevious(input, i);

          return {
            distanceKm: getJourneyDistanceMeters(entry) / 1000,
            startTimestamp: new Date(
              entry.activitySegment.duration.startTimestamp
            ),
            endTimestamp: new Date(entry.activitySegment.duration.endTimestamp),
            from: fromLocation
              ? {
                  name: fromLocation.location.name,
                  address: fromLocation.location.address,
                }
              : null,
            to: toLocation
              ? {
                  name: toLocation.location.name,
                  address: toLocation.location.address,
                }
              : null,
          };
        }
      }
      return null;
    })
    .filter(isDefined);
}

function getJourneyEntries(journeys: Journey[]): JourneyEntry[] {
  return journeys.flatMap((journey, i) => {
    if (journeys.length - 1 === i) {
      return [{ type: "journey", journey }];
    }
    if (journey.to === null) {
      return [{ type: "journey", journey }];
    }

    const nextJourney = journeys[i + 1];
    const parkingDuration = differenceInMinutes(
      nextJourney.startTimestamp,
      journey.endTimestamp
    );

    const confidence =
      journey.to?.address !== nextJourney.from?.address ? "low" : "high";

    return [
      { type: "journey", journey },
      {
        type: "parking",
        parking: {
          durationMinutes: parkingDuration,
          location: journey.to,
          confidence,
        },
      },
    ];
  });
}

function getSpeedAdjustedConsumption(
  speedKmh: number,
  config: CarConfig["carElectricityConsumptionKWhPer100kmAt"]
) {
  if (speedKmh >= 120) {
    return config[120];
  }

  if (speedKmh >= 100) {
    return config[100];
  }

  if (speedKmh >= 80) {
    return config[80];
  }

  return config[50];
}

function getTemperatureAdjustedConsumption(
  baseConsumption: number,
  startTimestamp: Date,
  temperatureConfig: TemperatureConfig
): number {
  const month = getMonth(startTimestamp) as Month;
  const hour = getHours(startTimestamp);

  const meanTemperature = temperatureConfig[month];
  // adjust for early mornings and late nights
  const estimatedTemperature = Math.round(
    hour < 9 || hour > 21 ? meanTemperature - 2.5 : meanTemperature + 2.5
  );

  const estimatedEfficiency: number | undefined = (
    temperatureEfficiencyPercentages as Record<string, number>
  )[estimatedTemperature.toFixed(0)];
  if (estimatedEfficiency !== undefined) {
    return baseConsumption / (estimatedEfficiency / 113);
  }

  const maxEntry = maxBy(
    Object.entries(temperatureEfficiencyPercentages),
    ([key]) => parseFloat(key)
  )!;
  const minEntry = minBy(
    Object.entries(temperatureEfficiencyPercentages),
    ([key]) => parseFloat(key)
  )!;
  if (estimatedTemperature > parseFloat(maxEntry[0])) {
    return baseConsumption / (maxEntry[1] / 113);
  }
  if (estimatedTemperature < parseFloat(minEntry[0])) {
    return baseConsumption / (minEntry[1] / 113);
  }

  console.warn(
    `Could not determine temperature adjusted consumption for temperature ${estimatedTemperature} (timestamp ${startTimestamp.toISOString()})`
  );
  return baseConsumption; // TODO
}

function getConsumptionJourney(
  journey: Journey,
  config: CarConfig,
  temperatureConfig: TemperatureConfig,
  batteryLeft: number
): ConsumptionJourney {
  const adjustedDistance =
    journey.distanceKm * config.distanceInaccuracyCoefficient;
  const journeyAverageSpeedKmh =
    adjustedDistance /
    (journey.endTimestamp.getTime() -
      journey.startTimestamp.getTime() / 1000 / 60 / 60);
  const adjustedConsumption = getTemperatureAdjustedConsumption(
    getSpeedAdjustedConsumption(
      journeyAverageSpeedKmh,
      config.carElectricityConsumptionKWhPer100kmAt
    ),
    journey.startTimestamp,
    temperatureConfig
  );
  const batteryUsage = isNaN(adjustedDistance)
    ? 0
    : (adjustedDistance / 100) * adjustedConsumption;
  if (batteryUsage > batteryLeft) {
    // ran out of battery, thus actual electric consumption is only the batteryLeft value
    // console.log(`Ran out of battery (demand ${batteryUsage} kWh)`);
    const electricKms = (batteryLeft / adjustedConsumption) * 100;
    const electricConsumption = batteryLeft;
    batteryLeft = 0;
    const otherFuelKms = adjustedDistance - electricKms;
    const otherFuelConsumption = config.isBEV
      ? (otherFuelKms / 100) *
        getTemperatureAdjustedConsumption(
          getSpeedAdjustedConsumption(
            journeyAverageSpeedKmh,
            config.carElectricityConsumptionKWhPer100kmAt
          ),
          journey.startTimestamp,
          temperatureConfig
        )
      : (otherFuelKms / 100) * config.carPetrolConsumptionLPer100Km;
    return {
      ...journey,
      distanceKm: adjustedDistance,
      electricConsumption,
      otherFuelConsumption: otherFuelConsumption,
      electricDistance: electricKms,
      otherFuelDistance: otherFuelKms,
      batteryLeftKWhAfter: 0,
    };
  } else {
    // console.log(
    //  `Drove full electric (distance ${adjustedDistance}, demand ${batteryUsage} kWh)`
    // );
    const electricKms = (batteryUsage / adjustedConsumption) * 100;
    const electricConsumption = batteryUsage;
    batteryLeft = batteryLeft - batteryUsage;
    return {
      ...journey,
      distanceKm: adjustedDistance,
      electricConsumption,
      otherFuelConsumption: 0,
      electricDistance: electricKms,
      otherFuelDistance: 0,
      batteryLeftKWhAfter: batteryLeft,
    };
  }
}

function getChargingPower(
  location: Location,
  config: CarConfig,
  chargingConfig: ChargingConfig
): number {
  const configEntry =
    chargingConfig[location.address] ||
    (location.name ? chargingConfig[location.name] : undefined);
  if (!configEntry) {
    return 0;
  }

  return Math.min(config.carMaxChargingPower, configEntry);
}

function getChargingEntry(
  parking: Parking,
  config: CarConfig,
  chargingConfig: ChargingConfig,
  batteryLeft: number
): ChargingEntry {
  const chargingTimeMinutes = Math.max(0, parking.durationMinutes - 5);
  const maxCharged = config.carElectricBatteryKWh - batteryLeft;
  const chargingPower = getChargingPower(
    parking.location,
    config,
    chargingConfig
  );
  const charged = Math.min(
    maxCharged,
    (chargingPower * chargingTimeMinutes) / 60
  );
  return {
    ...parking,
    chargedKWh: charged,
    batteryLeftKWhAfter: batteryLeft + charged,
    chargingPower,
    chargingDurationMinutes: chargingTimeMinutes,
  };
}

function getBatteryLeft(lastEntry: ConsumptionEntry | undefined) {
  if (!lastEntry) {
    return 0;
  }
  return lastEntry.type === "journey"
    ? lastEntry.journey.batteryLeftKWhAfter
    : lastEntry.parking.batteryLeftKWhAfter;
}

function getConsumptionEntry(
  journeyEntry: JourneyEntry,
  previousConsumptionEntry: ConsumptionEntry | undefined,
  config: CarConfig,
  chargingConfig: ChargingConfig,
  temperatureConfig: TemperatureConfig
): ConsumptionEntry {
  return journeyEntry.type === "journey"
    ? {
        type: "journey",
        journey: getConsumptionJourney(
          journeyEntry.journey,
          config,
          temperatureConfig,
          previousConsumptionEntry
            ? getBatteryLeft(previousConsumptionEntry)
            : config.carElectricBatteryKWh
        ),
      }
    : {
        type: "parking",
        parking: getChargingEntry(
          journeyEntry.parking,
          config,
          chargingConfig,
          previousConsumptionEntry
            ? getBatteryLeft(previousConsumptionEntry)
            : config.carElectricBatteryKWh
        ),
      };
}

function getConsumptionEntries(
  journeyEntries: JourneyEntry[],
  config: CarConfig,
  chargingConfig: ChargingConfig,
  temperatureConfig: TemperatureConfig
): ConsumptionEntry[] {
  if (journeyEntries.length === 0) {
    return [];
  }
  const [first, ...rest] = journeyEntries;
  const firstConsumptionEntry: ConsumptionEntry = getConsumptionEntry(
    first,
    undefined,
    config,
    chargingConfig,
    temperatureConfig
  );
  return rest.reduce(
    (prev, curr) => [
      ...prev,
      getConsumptionEntry(
        curr,
        last(prev),
        config,
        chargingConfig,
        temperatureConfig
      ),
    ],
    [firstConsumptionEntry]
  );
}

export function calculatePowerSourceResult(
  input: TimelineObject[],
  config: CarConfig,
  chargingConfig: ChargingConfig,
  temperatureConfig: TemperatureConfig
): CarPowerSourceResultV2 {
  const journeys = getJourneys(input);
  const journeyEntries = getJourneyEntries(journeys);
  const consumptionEntries = getConsumptionEntries(
    journeyEntries,
    config,
    chargingConfig,
    temperatureConfig
  );

  return { entries: consumptionEntries };
}
