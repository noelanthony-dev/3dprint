import { describe, expect, it } from "vitest";

import {
  formatDateLabel,
  formatMonthLabel,
  getLocalDateToken,
  getLocalMonthToken,
  getNextDate,
  getNextMonth,
  getPreviousDate,
  getPreviousMonth,
  isIsoDate,
  isMonthToken,
} from "./datePeriod";

describe("date period helpers", () => {
  it("builds local calendar tokens without converting through UTC", () => {
    const localDate = new Date(2026, 7, 29, 23, 30);

    expect(getLocalDateToken(localDate)).toBe("2026-08-29");
    expect(getLocalMonthToken(localDate)).toBe("2026-08");
  });

  it("navigates across month, year, and leap-day boundaries", () => {
    expect(getPreviousDate("2026-01-01")).toBe("2025-12-31");
    expect(getNextDate("2026-12-31")).toBe("2027-01-01");
    expect(getNextDate("2028-02-28")).toBe("2028-02-29");
    expect(getPreviousDate("2028-03-01")).toBe("2028-02-29");
    expect(getNextMonth("2026-12")).toBe("2027-01");
    expect(getPreviousMonth("2026-01")).toBe("2025-12");
  });

  it("rejects impossible dates and months", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isMonthToken("2026-13")).toBe(false);
    expect(getNextDate("not-a-date")).toBe("not-a-date");
  });

  it("formats readable period labels", () => {
    expect(formatDateLabel("2026-08-29")).toBe("August 29, 2026");
    expect(formatMonthLabel("2026-08")).toBe("August 2026");
  });
});
