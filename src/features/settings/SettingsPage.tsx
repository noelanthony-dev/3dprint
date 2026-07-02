import {
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { Page } from "@/components/layout/Page";
import { Badge, MetricPanel, Panel, ToolbarButton } from "@/components/ui";
import { localSettingsRepository } from "@/data/settings/localSettingsRepository";
import {
  CURRENCY_OPTIONS,
  DEFAULT_APP_SETTINGS,
  validateAppSettings,
  type AppSettings,
} from "@/domain/settings";

export function SettingsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => localSettingsRepository.load());

  const validation = useMemo(() => validateAppSettings(settings), [settings]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!validation.valid) {
      setMessage(Object.values(validation.errors)[0] ?? "Check the settings values.");
      return;
    }

    setSettings(localSettingsRepository.save(settings));
    setMessage("Settings saved locally.");
  }

  function handleReset(): void {
    setSettings(localSettingsRepository.reset());
    setMessage("Settings reset to local defaults.");
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton onClick={handleReset}>Reset Defaults</ToolbarButton>
          <ToolbarButton form="settings-form" tone="primary" type="submit">
            Save Settings
          </ToolbarButton>
        </>
      }
      description="Manage local-only defaults used by costing, HueForge thresholds, unit display, and backup exports."
      meta={["Local preferences", "No account", "No sync"]}
      title="Settings"
    >
      {message ? (
        <div className={message.includes("saved") || message.includes("reset") ? "callout" : "callout callout--warning"}>
          <Badge tone={message.includes("saved") || message.includes("reset") ? "success" : "warning"}>Settings</Badge>
          <p>{message}</p>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricPanel detail={settings.currencySymbol} label="Currency" value={settings.currencySymbol} />
        <MetricPanel detail="costing default" label="Labor Rate" value={formatCurrency(settings.laborRateHourly)} />
        <MetricPanel detail="costing default" label="Electricity" value={`${settings.electricityRatePerKwh.toFixed(2)} / kWh`} />
        <MetricPanel detail="HueForge matching" label="Delta E" value={settings.hueForgeAcceptableDeltaE.toFixed(1)} />
      </div>

      <form className="content-grid content-grid--costing" id="settings-form" onSubmit={handleSubmit}>
        <div className="side-stack">
          <Panel title="Cost Assumptions">
            <div className="inventory-form">
              <label className="form-field">
                <span>Labor Rate ($/hr)</span>
                <input
                  min="0"
                  onChange={(event) => updateNumber(setSettings, "laborRateHourly", event.target.value)}
                  step="0.01"
                  type="number"
                  value={settings.laborRateHourly}
                />
              </label>
              <label className="form-field">
                <span>Electricity ($/kWh)</span>
                <input
                  min="0"
                  onChange={(event) => updateNumber(setSettings, "electricityRatePerKwh", event.target.value)}
                  step="0.01"
                  type="number"
                  value={settings.electricityRatePerKwh}
                />
              </label>
              <label className="form-field">
                <span>Avg Machine Life (hours)</span>
                <input
                  min="1"
                  onChange={(event) => updateNumber(setSettings, "machineLifeHours", event.target.value)}
                  step="1"
                  type="number"
                  value={settings.machineLifeHours}
                />
              </label>
              <label className="form-field">
                <span>Expected Failure Rate (%)</span>
                <input
                  max="100"
                  min="0"
                  onChange={(event) => updateNumber(setSettings, "expectedFailureRatePercent", event.target.value)}
                  step="0.1"
                  type="number"
                  value={settings.expectedFailureRatePercent}
                />
              </label>
            </div>
          </Panel>

          <Panel title="HueForge Thresholds">
            <div className="inventory-form">
              <label className="form-field">
                <span>Max Transmission Distance (TD)</span>
                <input
                  min="0"
                  onChange={(event) => updateNumber(setSettings, "hueForgeMaxTransmissionDistance", event.target.value)}
                  step="0.1"
                  type="number"
                  value={settings.hueForgeMaxTransmissionDistance}
                />
              </label>
              <label className="form-field">
                <span>Min Transmission Distance (TD)</span>
                <input
                  min="0"
                  onChange={(event) => updateNumber(setSettings, "hueForgeMinTransmissionDistance", event.target.value)}
                  step="0.1"
                  type="number"
                  value={settings.hueForgeMinTransmissionDistance}
                />
              </label>
              <label className="form-field" data-wide="true">
                <span>Acceptable Delta E Range</span>
                <input
                  min="0.1"
                  onChange={(event) => updateNumber(setSettings, "hueForgeAcceptableDeltaE", event.target.value)}
                  step="0.1"
                  type="number"
                  value={settings.hueForgeAcceptableDeltaE}
                />
              </label>
            </div>
          </Panel>
        </div>

        <div className="side-stack">
          <Panel title="Preferences">
            <div className="key-value-list">
              <span>Dark mode</span>
              <input
                checked={settings.darkMode}
                className="settings-checkbox"
                onChange={(event) => updateBoolean(setSettings, "darkMode", event.target.checked)}
                type="checkbox"
              />
              <span>Metric units</span>
              <input
                checked={settings.metricUnits}
                className="settings-checkbox"
                onChange={(event) => updateBoolean(setSettings, "metricUnits", event.target.checked)}
                type="checkbox"
              />
              <span>Currency display</span>
              <select
                className="table-input"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    currencySymbol: event.target.value as AppSettings["currencySymbol"],
                  }))
                }
                value={settings.currencySymbol}
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </Panel>

          <Panel title="Validation">
            <div className="warning-list">
              {validation.valid ? (
                <div className="callout">
                  <Badge tone="success">Ready</Badge>
                  <p>Settings are valid for local save and backup export.</p>
                </div>
              ) : (
                Object.entries(validation.errors).map(([field, error]) => (
                  <div className="callout callout--warning" key={field}>
                    <Badge tone="warning">{field}</Badge>
                    <p>{error}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Local Defaults">
            <div className="key-value-list">
              <span>Default labor</span>
              <strong>{formatCurrency(DEFAULT_APP_SETTINGS.laborRateHourly)}</strong>
              <span>Default electricity</span>
              <strong>{DEFAULT_APP_SETTINGS.electricityRatePerKwh.toFixed(2)} / kWh</strong>
              <span>Default failure</span>
              <strong>{DEFAULT_APP_SETTINGS.expectedFailureRatePercent.toFixed(1)}%</strong>
              <span>Default Delta E</span>
              <strong>{DEFAULT_APP_SETTINGS.hueForgeAcceptableDeltaE.toFixed(1)}</strong>
            </div>
          </Panel>
        </div>
      </form>
    </Page>
  );
}

function updateNumber(
  setSettings: Dispatch<SetStateAction<AppSettings>>,
  key: keyof Pick<
    AppSettings,
    | "electricityRatePerKwh"
    | "expectedFailureRatePercent"
    | "hueForgeAcceptableDeltaE"
    | "hueForgeMaxTransmissionDistance"
    | "hueForgeMinTransmissionDistance"
    | "laborRateHourly"
    | "machineLifeHours"
  >,
  value: string,
): void {
  setSettings((current) => ({
    ...current,
    [key]: Number(value),
  }));
}

function updateBoolean(
  setSettings: Dispatch<SetStateAction<AppSettings>>,
  key: keyof Pick<AppSettings, "darkMode" | "metricUnits">,
  value: boolean,
): void {
  setSettings((current) => ({
    ...current,
    [key]: value,
  }));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}
