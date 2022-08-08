import { debounce, groupBy, sortBy } from "lodash";
import React, { ChangeEvent, useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import ButtonPopover from "./ButtonPopover";
import { format, getMonth, isSameDay } from "date-fns";
import { fi } from "date-fns/locale";
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryContainer,
  VictoryLabel,
  VictoryLegend,
  VictoryStack,
  VictoryTheme,
  VictoryTooltip,
} from "victory";
import { calculatePowerSourceResult } from "./calculator";
import {
  CarConfig,
  ChargingConfig,
  ChargingEntry,
  ConsumptionEntry,
  ConsumptionJourney,
  ConsumptionJourneyEntry,
  DeepPartial,
  Location,
  TimelineObject,
} from "./types";
import "./App.css";
import round from "./round";

const defaultCarConfig: CarConfig = {
  version: 1,
  petrolPriceEuroPerLiter: 2.5,
  electricityPriceEuroPerKWh: 0.2,
  carElectricBatteryKWh: 11.5,
  carElectricityConsumptionKWhPer100kmAt: {
    "50": 17,
    "80": 19,
    "100": 21,
    "120": 23,
  },
  carPetrolConsumptionLPer100Km: 6.5,
  carMaxChargingPower: 3.7,
  distanceInaccuracyCoefficient: 1.05,
};

const defaultChargingConfig: ChargingConfig = {
  "K-Supermarket Raisio Center": 50,
  Mylly: 22,
  Sello: 22,
  "Shopping Center Sello": 22,
  "Nauvon vierassatama": 22,
  "Pizzeria Najaden": 22,
  "K-Supermarket Mankkaa": 50,
  "Shopping Center Grani": 50,
  "Lidl Laajalahti Bredis": 22,
  "K-Citymarket Nummela": 50,
  "K-Citymarket Vichtis Nummela": 50,
  "K-Supermarket Jakobacka": 11,
  "Kauppakeskus Kaari": 20,
  "K-Citymarket Rauma": 50,
  "Maritime Centre Vellamo": 22,
  "Haminan Sotilaskotiyhdistys Ry": 22, // S-market Hamina, Haminan kauppatori etc.
  "Restaurant mon ami": 22, // S-market Hamina, Haminan kauppatori etc.
  "Hotel Haikko Manor": 22,
  "Hotel Amandis": 22, // Alikatu 1-7 P-alue,
  "Porvoon Paahtimo Bar & Café": 22, // Porvoon Kaupungintalo, Porvoon tori, Rihkamatori, Porvoo Lippakioski
  "ABC Renkomäki Lahtis": 150,
  "Kärkkäinen Lahtis": 60,
  "Teboil Huttula": 22,
  "ABC Heinola": 150,
  "Iso Omena": 100,
  Motonet: 22,
  "Ravintola Siilinpesä": 22, // Siilitien Metroasema - Liityntäpysäköinti
  "Prisma Kirkkonummi": 100,
  "Verkkokauppa.com": 22,
};

function ControlledNumberInput({
  label,
  value,
  step = 0.5,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const onRawValueChange = (value: string) => {
    const numValue = parseFloat(value);
    console.log("onChange", value, numValue);
    if ((!isNaN(numValue) && !value.endsWith(".")) || !value.endsWith(",")) {
      onChange(numValue);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedOnRawValueChange = useCallback(
    debounce(onRawValueChange, 500, {
      leading: false,
      trailing: true,
    }),
    []
  );

  const [batteryKWh, setBatteryKWh] = useState(value.toString());
  useEffect(() => setBatteryKWh(value.toString()), [value]);

  return (
    <label>
      {label}{" "}
      <input
        type="number"
        step={step}
        value={batteryKWh}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setBatteryKWh(e.target.value);
          debouncedOnRawValueChange(e.target.value);
        }}
      />
    </label>
  );
}

type Config = { carConfig: CarConfig; chargingConfig: ChargingConfig };
function Configuration({
  onCarConfigChange,
  config,
}: {
  onCarConfigChange: (config: DeepPartial<CarConfig>) => void;
  config: Config;
}) {
  const [advancedConsumption, setAdvancedConsumption] = useState(
    Object.values(config.carConfig.carElectricityConsumptionKWhPer100kmAt).some(
      (entry) =>
        entry !== config.carConfig.carElectricityConsumptionKWhPer100kmAt[50]
    )
  );
  return (
    <details className="config">
      <summary>Konfiguraatio</summary>
      <ControlledNumberInput
        label="Auton akun koko kWh"
        value={config.carConfig.carElectricBatteryKWh}
        onChange={(value) => {
          onCarConfigChange({
            carElectricBatteryKWh: value,
          });
        }}
      />
      <label>
        Nopeuskohtainen kulutus{" "}
        <input
          type="checkbox"
          checked={
            config.carConfig.carElectricityConsumptionKWhPer100kmAt !==
            undefined
          }
          onChange={(e) => {
            const newValue = !advancedConsumption;
            setAdvancedConsumption(newValue);
            if (!newValue) {
              onCarConfigChange({
                carElectricityConsumptionKWhPer100kmAt: {
                  "50": config.carConfig
                    .carElectricityConsumptionKWhPer100kmAt[80],
                  "80": config.carConfig
                    .carElectricityConsumptionKWhPer100kmAt[80],
                  "100":
                    config.carConfig.carElectricityConsumptionKWhPer100kmAt[80],
                  "120":
                    config.carConfig.carElectricityConsumptionKWhPer100kmAt[80],
                },
              });
            }
          }}
        />
      </label>
      {!advancedConsumption && (
        <ControlledNumberInput
          label="Kulutus kWh/100km"
          value={config.carConfig.carElectricityConsumptionKWhPer100kmAt[80]}
          onChange={(value) => {
            onCarConfigChange({
              carElectricityConsumptionKWhPer100kmAt: {
                "50": value,
                "80": value,
                "100": value,
                "120": value,
              },
            });
          }}
        />
      )}
      {advancedConsumption && (
        <>
          <ControlledNumberInput
            label="Kulutus kWh/100km @ 50 km/h"
            value={config.carConfig.carElectricityConsumptionKWhPer100kmAt[50]}
            onChange={(value) => {
              onCarConfigChange({
                carElectricityConsumptionKWhPer100kmAt: {
                  50: value,
                },
              });
            }}
          />
          <ControlledNumberInput
            label="Kulutus kWh/100km @ 80 km/h"
            value={config.carConfig.carElectricityConsumptionKWhPer100kmAt[80]}
            onChange={(value) => {
              onCarConfigChange({
                carElectricityConsumptionKWhPer100kmAt: {
                  80: value,
                },
              });
            }}
          />
          <ControlledNumberInput
            label="Kulutus kWh/100km @ 100 km/h"
            value={config.carConfig.carElectricityConsumptionKWhPer100kmAt[100]}
            onChange={(value) => {
              onCarConfigChange({
                carElectricityConsumptionKWhPer100kmAt: {
                  100: value,
                },
              });
            }}
          />
          <ControlledNumberInput
            label="Kulutus kWh/100km @ 120 km/h"
            value={config.carConfig.carElectricityConsumptionKWhPer100kmAt[120]}
            onChange={(value) => {
              onCarConfigChange({
                carElectricityConsumptionKWhPer100kmAt: {
                  120: value,
                },
              });
            }}
          />
        </>
      )}
      <ControlledNumberInput
        label="Kulutus l/100km"
        value={config.carConfig.carPetrolConsumptionLPer100Km}
        step={0.1}
        onChange={(value) => {
          onCarConfigChange({
            carPetrolConsumptionLPer100Km: value,
          });
        }}
      />
      <ControlledNumberInput
        label="Maksimi latausteho kWh"
        value={config.carConfig.carMaxChargingPower}
        step={0.1}
        onChange={(value) => {
          onCarConfigChange({
            carMaxChargingPower: value,
          });
        }}
      />
      <ControlledNumberInput
        label="Sähkön hinta €/kWh"
        value={config.carConfig.electricityPriceEuroPerKWh}
        step={0.01}
        onChange={(value) => {
          onCarConfigChange({
            electricityPriceEuroPerKWh: value,
          });
        }}
      />
      <ControlledNumberInput
        label="Bensiinin hinta €/l"
        value={config.carConfig.petrolPriceEuroPerLiter}
        step={0.05}
        onChange={(value) => {
          onCarConfigChange({
            petrolPriceEuroPerLiter: value,
          });
        }}
      />
      <ControlledNumberInput
        label="Lähtödatan matkojen pituuden korjauskerroin"
        value={config.carConfig.distanceInaccuracyCoefficient}
        step={0.01}
        onChange={(value) => {
          onCarConfigChange({
            distanceInaccuracyCoefficient: value,
          });
        }}
      />
      {advancedConsumption ? (
        <p>
          Auton kantama sähköajossa yllä olevilla asetuksilla{" "}
          {Object.values(
            config.carConfig.carElectricityConsumptionKWhPer100kmAt
          )
            .map((value) =>
              round((config.carConfig.carElectricBatteryKWh / value) * 100)
            )
            .join(" / ")}{" "}
          km
        </p>
      ) : (
        <p>
          Auton kantama sähköajossa yllä olevilla asetuksilla{" "}
          {round(
            (config.carConfig.carElectricBatteryKWh /
              config.carConfig.carElectricityConsumptionKWhPer100kmAt[80]) *
              100
          )}{" "}
          km
        </p>
      )}
    </details>
  );
}

function MyDropzone({
  onDrop,
}: {
  onDrop: (fileName: string, fileContents: TimelineObject[]) => void;
}) {
  const onDropCallback = useCallback(
    async (acceptedFiles: File[]) => {
      const filesContents = await Promise.all(
        acceptedFiles.map(async (file) => {
          const text = await file.text();
          const json = JSON.parse(text);
          if (!json.timelineObjects) {
            throw new Error(
              "Invalid JSON file provided - must be a Google Semantic Location History file"
            );
          }

          return json.timelineObjects as TimelineObject[];
        })
      );

      onDrop(
        acceptedFiles.map((file) => file.name).join(", "),
        filesContents.flat()
      );
    },
    [onDrop]
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropCallback,
  });

  return (
    <div className="dropzone" {...getRootProps()}>
      <input {...getInputProps()} />
      {isDragActive ? (
        <p>Raahaa tiedosto(t) tähän</p>
      ) : (
        <p>Raahaa tiedosto(t) tähän tai klikkaa tästä valitaksesi</p>
      )}
    </div>
  );
}

function formatDateTimeRange(start: Date, end: Date) {
  if (isSameDay(start, end)) {
    return `${format(start, "d.M.y")} ${format(start, "H:mm")}-${format(
      end,
      "H:mm"
    )}`;
  }

  return `${format(start, "d.M.y H:mm")}-${format(end, "d.M.y H:mm")}`;
}

const electricBg = "#c6ffe6";
const petrolBg = "#ffe1cd";

const NotChargingIcon = ({ title }: { title: string }) => (
  <span title={title} style={{ transform: "scale(0.75)" }}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="currentColor"
      className="bi bi-lightning-charge"
      viewBox="0 0 16 16"
    >
      <path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09zM4.157 8.5H7a.5.5 0 0 1 .478.647L6.11 13.59l5.732-6.09H9a.5.5 0 0 1-.478-.647L9.89 2.41 4.157 8.5z" />
    </svg>
  </span>
);

const ChargingIcon = ({ title }: { title: string }) => (
  <span title={title} style={{ transform: "scale(0.75)" }}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="currentColor"
      className="bi bi-lightning-charge-fill"
      viewBox="0 0 16 16"
    >
      <path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z" />
    </svg>
  </span>
);

const WarningIcon = ({ title }: { title: string }) => (
  <span title={title} style={{ transform: "scale(0.75)" }}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="currentColor"
      className="bi bi-exclamation-triangle"
      viewBox="0 0 16 16"
    >
      <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z" />
      <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995z" />
    </svg>
  </span>
);

function formatDurationMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function ChargerConfig({
  charging,
  chargingLocation,
  chargingPower,
  onChargingConfigChange,
}: {
  charging: ChargingEntry | undefined;
  chargingPower: number | undefined;
  chargingLocation: Location | undefined;
  onChargingConfigChange: (location: string, value: number) => void;
}) {
  if (!charging?.location) {
    return <div>Tähän sijaintiin ei ole mahdollista asettaa latausta.</div>;
  }

  return (
    <div>
      <h4>{charging.location.name ?? charging.location.address}</h4>
      <p className="charger-config-help">
        {getChargingInfoText(charging, chargingLocation)}
      </p>
      <ControlledNumberInput
        label={`Vaihda sijainnin ${
          charging.location.name ?? charging.location.address
        } lataustehoa`}
        value={chargingPower ?? 0}
        step={0.1}
        onChange={(value) =>
          onChargingConfigChange(
            charging.location.name ?? charging.location.address,
            value
          )
        }
      />{" "}
      kW
    </div>
  );
}

function getChargingInfoText(
  charging: ChargingEntry,
  location: Location | undefined
) {
  return `Lataus ${formatDurationMinutes(
    charging.chargingDurationMinutes
  )} teholla ${charging.chargingPower} kW (${round(
    charging.chargedKWh
  )} kWh, ${round(
    charging.batteryLeftKWhAfter - charging.chargedKWh
  )} ⇒ ${round(charging.batteryLeftKWhAfter)} kWh)${
    location?.address !== charging.location.address
      ? ` paikassa ${charging.location.name ?? charging.location.address}`
      : ""
  }`;
}

function JourneyLocationInfo({
  location,
  charging,
  chargingConfig,
  onChargingConfigChange,
}: {
  location: Location | undefined;
  charging: ChargingEntry | undefined;
  chargingConfig: ChargingConfig;
  onChargingConfigChange: (location: string, value: number) => void;
}) {
  const chargerId =
    charging?.location.name ?? charging?.location.address ?? "<default>";
  return (
    <>
      {location?.name ?? location?.address ?? "<ei tiedossa>"}
      {charging && charging.chargingPower > 0 ? (
        <ButtonPopover
          buttonLabel={
            <ChargingIcon title={getChargingInfoText(charging, location)} />
          }
        >
          <ChargerConfig
            charging={charging}
            chargingLocation={location}
            chargingPower={chargingConfig[chargerId]}
            onChargingConfigChange={onChargingConfigChange}
          />
        </ButtonPopover>
      ) : (
        <ButtonPopover buttonLabel={<NotChargingIcon title={`Ei latausta`} />}>
          <ChargerConfig
            charging={charging}
            chargingLocation={location}
            chargingPower={chargingConfig[chargerId]}
            onChargingConfigChange={onChargingConfigChange}
          />
        </ButtonPopover>
      )}
      {charging && charging.confidence === "low" ? (
        <WarningIcon title="Pysäköintipaikkaa ei voida määrittää luotettavasti" />
      ) : null}
    </>
  );
}

function Journey({
  journey,
  from,
  to,
  chargingConfig,
  onChargingConfigChange,
}: {
  journey: ConsumptionJourney;
  from: ChargingEntry | undefined;
  to: ChargingEntry | undefined;
  chargingConfig: ChargingConfig;
  onChargingConfigChange: (location: string, value: number) => void;
}) {
  const percentageElectric = journey.electricDistance / journey.distanceKm;
  return (
    <tr
      style={{
        backgroundImage: `linear-gradient(90deg, ${electricBg} 0%, ${electricBg} ${
          percentageElectric * 100
        }%, ${petrolBg} ${percentageElectric * 100}%, ${petrolBg} 100%)`,
      }}
    >
      <td>{round(journey.distanceKm)} km</td>
      <td title={`${round(journey.electricConsumption)} kWh`}>
        {round(journey.electricDistance)} km
      </td>
      <td title={`${round(journey.petrolConsumption)} l`}>
        {round(journey.petrolDistance)} km
      </td>
      <td className="secondary">
        <p>
          {formatDateTimeRange(journey.startTimestamp, journey.endTimestamp)}
        </p>
        <div className="journey-from-to">
          <>
            <JourneyLocationInfo
              chargingConfig={chargingConfig}
              location={journey.from ?? undefined}
              charging={from}
              onChargingConfigChange={onChargingConfigChange}
            />
            {" - "}
            <JourneyLocationInfo
              chargingConfig={chargingConfig}
              location={journey.to ?? undefined}
              charging={to}
              onChargingConfigChange={onChargingConfigChange}
            />
          </>
        </div>
      </td>
    </tr>
  );
}

function JourneyLengthChart({ journeys }: { journeys: ConsumptionJourney[] }) {
  const monthlyData = sortBy(
    Object.entries(
      groupBy(
        journeys,
        (entry) => `<${Math.floor(entry.distanceKm / 10) + 1}0 km`
      )
    ),
    ([groupName, entries]) => entries[0].distanceKm
  );
  const monthlyElectricData = monthlyData.map(([groupName, group]) => ({
    groupName,
    distance: group.reduce((prev, curr) => prev + curr.electricDistance, 0),
  }));
  const monthlyPetrolData = monthlyData.map(([groupName, group]) => ({
    groupName,
    distance: group.reduce((prev, curr) => prev + curr.petrolDistance, 0),
  }));

  return (
    <Chart
      title="Matkan pituuden mukaan"
      electricData={monthlyElectricData}
      petrolData={monthlyPetrolData}
    />
  );
}

function YearMonthlyChart({ journeys }: { journeys: ConsumptionJourney[] }) {
  const monthlyData = sortBy(
    Object.entries(
      groupBy(journeys, (entry) =>
        format(entry.startTimestamp, "MMM yy", { locale: fi })
      )
    ),
    ([groupName, entries]) => entries[0].startTimestamp
  );
  const monthlyElectricData = monthlyData.map(([groupName, group]) => ({
    groupName,
    distance: group.reduce((prev, curr) => prev + curr.electricDistance, 0),
  }));
  const monthlyPetrolData = monthlyData.map(([groupName, group]) => ({
    groupName,
    distance: group.reduce((prev, curr) => prev + curr.petrolDistance, 0),
  }));

  return (
    <Chart
      title="Vuosi-kuukausittain"
      electricData={monthlyElectricData}
      petrolData={monthlyPetrolData}
    />
  );
}

function MonthlyChart({ journeys }: { journeys: ConsumptionJourney[] }) {
  const monthlyData = sortBy(
    Object.entries(
      groupBy(journeys, (entry) =>
        format(entry.startTimestamp, "MMM", { locale: fi })
      )
    ),
    ([groupName, entries]) => getMonth(entries[0].startTimestamp)
  );
  const monthlyElectricData = monthlyData.map(([groupName, group]) => ({
    groupName,
    distance: group.reduce((prev, curr) => prev + curr.electricDistance, 0),
  }));
  const monthlyPetrolData = monthlyData.map(([groupName, group]) => ({
    groupName,
    distance: group.reduce((prev, curr) => prev + curr.petrolDistance, 0),
  }));

  return (
    <Chart
      title="Kuukausittain"
      electricData={monthlyElectricData}
      petrolData={monthlyPetrolData}
    />
  );
}

function Chart({
  electricData,
  petrolData,
  title,
}: {
  electricData: Array<{ groupName: string; distance: number }>;
  petrolData: Array<{ groupName: string; distance: number }>;
  title: string;
}) {
  const electricDataWithLabels = electricData.map((entry) => ({
    ...entry,
    label: `${round(entry.distance)} km`,
  }));
  const petrolDataWithLabels = petrolData.map((entry) => ({
    ...entry,
    label: `${round(entry.distance)} km`,
  }));
  return (
    <div className="chart">
      <h3>{title}</h3>
      <VictoryChart
        domainPadding={{ x: [0, 10] }}
        theme={VictoryTheme.material}
        height={200}
        padding={{ top: 20, left: 50, bottom: 50, right: 0 }}
        containerComponent={
          <VictoryContainer
            style={{
              touchAction: "auto",
            }}
          />
        }
      >
        <VictoryAxis
          tickValues={electricData.map((entry) => entry.groupName)}
          tickLabelComponent={
            <VictoryLabel
              angle={-60}
              dx={7}
              dy={-5}
              textAnchor="end"
              style={{ fill: "rgb(118 155 172)", fontSize: "9px" }}
            />
          }
        />
        <VictoryAxis
          dependentAxis
          tickFormat={(x) => `${x}km`}
          style={{ axis: { strokeWidth: 0 } }}
          tickLabelComponent={
            <VictoryLabel
              style={{ fill: "rgb(118 155 172)", fontSize: "9px" }}
            />
          }
        />
        <VictoryLegend
          x={50}
          centerTitle
          orientation="horizontal"
          style={{
            title: { fontSize: 6 },
            labels: { fontSize: 6, fill: "rgb(118, 155, 172)" },
          }}
          data={[
            { name: "Sähkö", symbol: { fill: "rgb(101 176 101)" } },
            { name: "Bensiini", symbol: { fill: "rgb(177 89 89)" } },
          ]}
        />
        <VictoryStack>
          <VictoryBar
            data={electricDataWithLabels}
            labelComponent={<VictoryTooltip />}
            x="groupName"
            y="distance"
            style={{ data: { fill: "rgb(101 176 101)" } }}
          />
          <VictoryBar
            data={petrolDataWithLabels}
            labelComponent={<VictoryTooltip />}
            x="groupName"
            y="distance"
            style={{ data: { fill: "rgb(177 89 89)" } }}
          />
        </VictoryStack>
      </VictoryChart>
    </div>
  );
}

function isJourney(entry: ConsumptionEntry): entry is ConsumptionJourneyEntry {
  return entry.type === "journey";
}

function findParkingAfter(
  currentIndex: number,
  entries: ConsumptionEntry[]
): ChargingEntry | undefined {
  const entry = entries[currentIndex + 1];
  if (entry && entry.type === "parking") {
    return entry.parking;
  }

  return undefined;
}

function findParkingBefore(
  currentIndex: number,
  entries: ConsumptionEntry[]
): ChargingEntry | undefined {
  const entry = entries[currentIndex - 1];
  if (entry && entry.type === "parking") {
    return entry.parking;
  }

  return undefined;
}

function ConsumptionResults({
  input,
  config,
  onChargingConfigChange,
}: {
  input: TimelineObject[];
  config: Config;
  onChargingConfigChange: (location: string, value: number) => void;
}) {
  const { carConfig, chargingConfig } = config;
  const result = calculatePowerSourceResult(input, carConfig, chargingConfig);
  console.log(result);
  const journeys = result.entries
    .filter(isJourney)
    .map((entry) => entry.journey);
  const electricDistance = journeys.reduce(
    (prev, curr) => prev + curr.electricDistance,
    0
  );
  const electricConsumption = journeys.reduce(
    (prev, curr) => prev + curr.electricConsumption,
    0
  );
  const petrolDistance = journeys.reduce(
    (prev, curr) => prev + curr.petrolDistance,
    0
  );
  const petrolConsumption = journeys.reduce(
    (prev, curr) => prev + curr.petrolConsumption,
    0
  );
  const percentageElectric =
    electricDistance / (electricDistance + petrolDistance);
  return (
    <div>
      <h2>Yhteenveto</h2>
      <table>
        <thead>
          <tr>
            <th>Käyttövoima</th>
            <th>Matka</th>
            <th>Kustannus</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Sähkö</th>
            <td>
              {round(electricDistance)} km ({round(percentageElectric * 100, 1)}{" "}
              %)
            </td>
            <td>
              {round(
                electricConsumption * carConfig.electricityPriceEuroPerKWh
              )}{" "}
              € ({round(electricConsumption)} kWh)
            </td>
          </tr>
          <tr>
            <th>Bensiini</th>
            <td>
              {round(petrolDistance)} km (
              {round((1 - percentageElectric) * 100, 1)} %)
            </td>
            <td>
              {round(petrolConsumption * carConfig.petrolPriceEuroPerLiter)} € (
              {round(petrolConsumption)} l)
            </td>
          </tr>
          <tr>
            <th>Yhteensä</th>
            <td>{round(petrolDistance + electricDistance)} km</td>
            <td>
              {round(
                petrolConsumption * carConfig.petrolPriceEuroPerLiter +
                  electricConsumption * carConfig.electricityPriceEuroPerKWh
              )}{" "}
              €
            </td>
          </tr>
        </tbody>
      </table>
      <h2>Graafit</h2>
      <div className="charts">
        <YearMonthlyChart journeys={journeys} />
        <MonthlyChart journeys={journeys} />
        <JourneyLengthChart journeys={journeys} />
      </div>
      <details>
        <summary>Matkat</summary>
        <table>
          <thead>
            <tr>
              <th>Matka</th>
              <th>Sähköllä</th>
              <th>Bensiinillä</th>
              <th>Tiedot</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((entry, i) =>
              entry.type === "journey" ? (
                <Journey
                  key={i}
                  chargingConfig={chargingConfig}
                  onChargingConfigChange={onChargingConfigChange}
                  journey={entry.journey}
                  from={
                    entry.journey.from
                      ? findParkingBefore(i, result.entries)
                      : undefined
                  }
                  to={
                    entry.journey.to
                      ? findParkingAfter(i, result.entries)
                      : undefined
                  }
                />
              ) : null
            )}
            <tr
              className="totals"
              style={{
                backgroundImage: `linear-gradient(90deg, ${electricBg} 0%, ${electricBg} ${
                  percentageElectric * 100
                }%, ${petrolBg} ${
                  percentageElectric * 100
                }%, ${petrolBg} 100%)`,
              }}
            >
              <td>{round(electricDistance + petrolDistance)} km</td>
              <td>{round(electricDistance)} km</td>
              <td>{round(petrolDistance)} km</td>
              <td />
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  );
}

function sortEntries(entries: TimelineObject[]) {
  return sortBy(entries, (entry) => {
    return (
      entry.activitySegment?.duration.startTimestamp ??
      entry.placeVisit?.duration.startTimestamp
    );
  });
}

const localStorageKey = "phev-power-source-usage-analyzer-config";
const localStorageExistingValue = localStorage.getItem(localStorageKey);

function App() {
  const [inputFile, setInputFile] = useState<TimelineObject[] | undefined>(
    undefined
  );
  const [inputFileName, setInputFileName] = useState<string | undefined>(
    undefined
  );
  const [config, setConfig] = useState<Config>(
    localStorageExistingValue &&
      JSON.parse(localStorageExistingValue).carConfig?.version ===
        defaultCarConfig.version
      ? JSON.parse(localStorageExistingValue)
      : {
          carConfig: defaultCarConfig,
          chargingConfig: defaultChargingConfig,
        }
  );

  useEffect(
    () => localStorage.setItem(localStorageKey, JSON.stringify(config)),
    [config]
  );

  return (
    <div className="App">
      <header className="App-header">
        <h1>Plugin-hybridin käyttövoima-arvio</h1>
        {inputFileName && <p className="filenames">{inputFileName}</p>}
        <MyDropzone
          onDrop={(fileName, fileContents) => {
            setInputFile(sortEntries(fileContents));
            setInputFileName(fileName);
          }}
        />
        <Configuration
          config={config}
          onCarConfigChange={(config) =>
            setConfig((current) => ({
              ...current,
              carConfig: {
                ...current.carConfig,
                ...config,
                carElectricityConsumptionKWhPer100kmAt: {
                  ...current.carConfig.carElectricityConsumptionKWhPer100kmAt,
                  ...config.carElectricityConsumptionKWhPer100kmAt,
                },
              },
            }))
          }
        />
        {inputFile && (
          <ConsumptionResults
            input={inputFile}
            config={config}
            onChargingConfigChange={(location, value) =>
              setConfig((current) => ({
                ...current,
                chargingConfig: {
                  ...current.chargingConfig,
                  [location]: value,
                },
              }))
            }
          />
        )}
        {!inputFile && (
          <>
            <p>
              Lisää Google Semantic Location History -tiedostot sovellukseen
              saadaksesi arvion. Tiedostojen sisältöä ei lähetetä selaimen
              ulkopuolelle.
            </p>
            <p>
              Ks.{" "}
              <a href="https://takeout.google.com/takeout/custom/location_history?dnm=false">
                Google Takeout
              </a>{" "}
              datan lataamiseksi.
            </p>
          </>
        )}
      </header>
    </div>
  );
}

export default App;
