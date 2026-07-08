import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { Toast, type ToastMessage, type ToastTone } from "@/components/feedback/Toast";
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
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => localSettingsRepository.load());
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const validation = useMemo(() => validateAppSettings(settings), [settings]);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback((tone: ToastTone, title: string, message: string) => {
    setToast({
      id: Date.now(),
      message,
      title,
      tone,
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!validation.valid) {
      showToast(
        "warning",
        "Check Settings",
        Object.values(validation.errors)[0] ?? "Check the settings values.",
      );
      return;
    }

    setIsSaving(true);

    try {
      await waitForFeedback();
      const currentDarkMode = localSettingsRepository.load().darkMode;
      const savedSettings = localSettingsRepository.save({
        ...settings,
        darkMode: currentDarkMode,
      });
      setSettings(savedSettings);
      showToast("success", "Settings Saved", "Local settings were updated.");
    } catch (error) {
      showToast(
        "danger",
        "Save Failed",
        error instanceof Error ? error.message : "Settings could not be saved locally.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset(): void {
    try {
      const currentDarkMode = localSettingsRepository.load().darkMode;
      const resetSettings = localSettingsRepository.save({
        ...DEFAULT_APP_SETTINGS,
        darkMode: currentDarkMode,
      });

      setSettings(resetSettings);
      showToast("success", "Defaults Restored", "Local settings were reset without changing theme.");
    } catch (error) {
      showToast(
        "danger",
        "Reset Failed",
        error instanceof Error ? error.message : "Settings could not be reset locally.",
      );
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton disabled={isSaving} onClick={handleReset}>Reset Defaults</ToolbarButton>
          <ToolbarButton
            form="settings-form"
            isLoading={isSaving}
            loadingLabel="Saving"
            tone="primary"
            type="submit"
          >
            Save Settings
          </ToolbarButton>
        </>
      }
      description="Manage local-only defaults used by costing, HueForge thresholds, unit display, and backup exports."
      meta={["Local preferences", "No account", "No sync"]}
      title="Settings"
    >
      <Toast onDismiss={clearToast} toast={toast} />

      <div className="metric-grid">
        <MetricPanel detail={settings.currencySymbol} label="Currency" value={settings.currencySymbol} />
        <MetricPanel detail="costing default" label="Labor Rate" value={formatCurrency(settings.laborRateHourly, settings.currencySymbol)} />
        <MetricPanel detail="costing default" label="Electricity" value={`${settings.electricityRatePerKwh.toFixed(2)} / kWh`} />
        <MetricPanel detail="HueForge matching" label="Delta E" value={settings.hueForgeAcceptableDeltaE.toFixed(1)} />
      </div>

      <form className="content-grid content-grid--costing" id="settings-form" onSubmit={handleSubmit}>
        <div className="side-stack">
          <Panel title="Cost Assumptions">
            <div className="inventory-form">
              <label className="form-field">
                <span>Labor Rate ({getCurrencyUnitLabel(settings.currencySymbol)}/hr)</span>
                <input
                  min="0"
                  onChange={(event) => updateNumber(setSettings, "laborRateHourly", event.target.value)}
                  step="0.01"
                  type="number"
                  value={settings.laborRateHourly}
                />
              </label>
              <label className="form-field">
                <span>Electricity ({getCurrencyUnitLabel(settings.currencySymbol)}/kWh)</span>
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
                <span>Printer Power (watts)</span>
                <input
                  min="0"
                  onChange={(event) => updateNumber(setSettings, "printerPowerWatts", event.target.value)}
                  step="1"
                  type="number"
                  value={settings.printerPowerWatts}
                />
              </label>
              <label className="form-field">
                <span>Wear & Tear ({getCurrencyUnitLabel(settings.currencySymbol)}/hr)</span>
                <input
                  min="0"
                  onChange={(event) => updateNumber(setSettings, "wearRatePerHour", event.target.value)}
                  step="0.01"
                  type="number"
                  value={settings.wearRatePerHour}
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
              <strong>{formatCurrency(DEFAULT_APP_SETTINGS.laborRateHourly, DEFAULT_APP_SETTINGS.currencySymbol)}</strong>
              <span>Default electricity</span>
              <strong>{DEFAULT_APP_SETTINGS.electricityRatePerKwh.toFixed(2)} / kWh</strong>
              <span>Default printer power</span>
              <strong>{DEFAULT_APP_SETTINGS.printerPowerWatts.toFixed(0)} watts</strong>
              <span>Default wear</span>
              <strong>{formatCurrency(DEFAULT_APP_SETTINGS.wearRatePerHour, DEFAULT_APP_SETTINGS.currencySymbol)} / hr</strong>
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
    | "printerPowerWatts"
    | "wearRatePerHour"
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
  key: keyof Pick<AppSettings, "metricUnits">,
  value: boolean,
): void {
  setSettings((current) => ({
    ...current,
    [key]: value,
  }));
}

function formatCurrency(value: number, currencyDisplay: AppSettings["currencySymbol"]): string {
  const currencyCode = getCurrencyCode(currencyDisplay);
  const locale = currencyCode === "PHP" ? "en-PH" : "en-US";

  return new Intl.NumberFormat(locale, {
    currency: currencyCode,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function getCurrencyCode(currencyDisplay: AppSettings["currencySymbol"]): string {
  return currencyDisplay.slice(0, 3);
}

function getCurrencyUnitLabel(currencyDisplay: AppSettings["currencySymbol"]): string {
  return getCurrencyCode(currencyDisplay) === "PHP" ? "₱" : currencyDisplay.slice(0, 3);
}

function waitForFeedback(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 500);
  });
}
