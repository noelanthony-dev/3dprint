import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { formatGramsLeft, normalizeHexColor, type FilamentRecord } from "@/domain/inventory";

import { getFilamentColorGroup, getFilamentDisplayName, groupFilamentsByColor } from "./filamentColorGroups";
import "./ProductionFilamentPicker.css";

interface ProductionFilamentPickerProps {
  readonly disabled?: boolean;
  readonly filaments: readonly FilamentRecord[];
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly selectedFilament: FilamentRecord | null;
}

export function ProductionFilamentPicker({
  disabled = false,
  filaments,
  label,
  onChange,
  selectedFilament,
}: ProductionFilamentPickerProps) {
  const id = useId();
  const listboxId = `${id}-stock`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const groups = useMemo(() => groupFilamentsByColor(filaments, query), [filaments, query]);
  const options = useMemo(() => groups.flatMap((group) => group.filaments), [groups]);
  const activeFilament = options[Math.min(activeIndex, options.length - 1)];
  const selectedIsAvailable = selectedFilament != null && filaments.some((filament) => filament.id === selectedFilament.id);
  const popupIsOpen = isOpen && !disabled;

  function openPicker(): void {
    setQuery("");
    const groupedOptions = groupFilamentsByColor(filaments).flatMap((group) => group.filaments);
    setActiveIndex(Math.max(0, groupedOptions.findIndex((filament) => filament.id === selectedFilament?.id)));
    setIsOpen(true);
  }

  function closePicker(restoreFocus = false): void {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  function chooseFilament(filament: FilamentRecord | null): void {
    onChange(filament ? String(filament.id) : "");
    closePicker(true);
  }

  useLayoutEffect(() => {
    if (!popupIsOpen || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 12;
    const gap = 6;
    const width = Math.min(Math.max(rect.width, 460), window.innerWidth - margin * 2);
    const below = window.innerHeight - rect.bottom - margin - gap;
    const above = rect.top - margin - gap;
    const opensAbove = below < Math.min(440, above);
    setPosition({
      width,
      left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
      maxHeight: Math.min(440, Math.max(0, opensAbove ? above : below)),
      ...(opensAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
    searchRef.current?.focus({ preventScroll: true });
  }, [popupIsOpen]);

  useEffect(() => {
    if (!popupIsOpen) return;
    const anchor = triggerRef.current?.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popupRef.current?.contains(target)) setIsOpen(false);
    }
    function handleScroll(event: Event): void {
      // Keep the floating list attached to its field when the modal moves.
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      const current = triggerRef.current?.getBoundingClientRect();
      if (current?.top !== anchor?.top || current?.left !== anchor?.left) setIsOpen(false);
    }
    function handleResize(): void {
      if (window.innerWidth !== viewport.width || window.innerHeight !== viewport.height) setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [popupIsOpen]);

  useEffect(() => {
    if (popupIsOpen && activeFilament) {
      const list = document.getElementById(listboxId);
      const option = document.getElementById(`${listboxId}-${activeFilament.id}`);
      if (!list || !option) return;
      const listBounds = list.getBoundingClientRect();
      const optionBounds = option.getBoundingClientRect();
      // Scroll only the choices, keeping the surrounding production modal still.
      if (optionBounds.top < listBounds.top + 32) {
        list.scrollTop -= listBounds.top + 32 - optionBounds.top;
      } else if (optionBounds.bottom > listBounds.bottom - 4) {
        list.scrollTop += optionBounds.bottom - listBounds.bottom + 4;
      }
    }
  }, [activeFilament, listboxId, popupIsOpen]);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => options.length ? (current + direction + options.length) % options.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeFilament) chooseFilament(activeFilament);
    }
  }

  const popup = popupIsOpen ? (
    <div className="production-filament-picker__popup" ref={popupRef} style={position}>
      <div className="production-filament-picker__search">
        <input
          aria-activedescendant={activeFilament ? `${listboxId}-${activeFilament.id}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded="true"
          aria-label={`Search ${label}`}
          autoComplete="off"
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search color, brand, material…"
          ref={searchRef}
          role="combobox"
          value={query}
        />
        <div className="production-filament-picker__summary" aria-live="polite">
          <span>Grouped by color</span>
          <span>{options.length} {options.length === 1 ? "spool" : "spools"}</span>
        </div>
      </div>
      <div aria-label={label} className="production-filament-picker__list" id={listboxId} role="listbox" tabIndex={-1}>
        {groups.map((group) => (
          <div aria-labelledby={`${id}-${group.id}`} key={group.id} role="group">
            <div className="production-filament-picker__group" id={`${id}-${group.id}`}>
              {group.label}<span>{group.filaments.length}</span>
            </div>
            {group.filaments.map((filament) => (
              <div
                aria-selected={filament.id === selectedFilament?.id}
                className="production-filament-picker__option"
                data-active={filament.id === activeFilament?.id}
                id={`${listboxId}-${filament.id}`}
                key={filament.id}
                onClick={() => chooseFilament(filament)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(options.indexOf(filament))}
                role="option"
              >
                <FilamentColorPreview filament={filament} />
                <span className="production-filament-picker__identity">
                  <strong>{getFilamentDisplayName(filament)}</strong>
                  <small>{filament.colorName} · {filament.materialType} · {filament.spoolStatus} · #{filament.id}</small>
                </span>
                <span className="production-filament-picker__stock">
                  <strong>{formatGramsLeft(filament.estimatedGramsLeft)}</strong>
                  <small>{filament.id === selectedFilament?.id ? "✓ Selected" : "available"}</small>
                </span>
              </div>
            ))}
          </div>
        ))}
        {options.length === 0 ? (
          <div className="production-filament-picker__empty">
            {query.trim() ? "No filaments match your search." : "No eligible stock available for this run."}
          </div>
        ) : null}
      </div>
      {selectedFilament ? (
        <div className="production-filament-picker__footer">
          <button onClick={() => chooseFilament(null)} type="button">Clear selection</button>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className="production-filament-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !popupRef.current?.contains(event.relatedTarget)) closePicker();
      }}
      onKeyDown={(event) => {
        if (event.key === "Tab" && popupIsOpen) {
          const fromSearch = event.target === searchRef.current;
          // The portal follows the form in the DOM. Resume tabbing at the field,
          // while keeping the clear button reachable from the search input.
          if ((fromSearch && (event.shiftKey || !selectedFilament)) || (!fromSearch && !event.shiftKey)) {
            closePicker(true);
          }
        }
        if (event.key === "Escape" && popupIsOpen) {
          event.preventDefault();
          event.stopPropagation();
          closePicker(true);
        }
      }}
      ref={rootRef}
    >
      <button
        aria-controls={popupIsOpen ? listboxId : undefined}
        aria-expanded={popupIsOpen}
        aria-haspopup="listbox"
        aria-label={`${label}: ${selectedFilament ? `${getFilamentDisplayName(selectedFilament)}, ${selectedFilament.colorName}, ${selectedFilament.materialType}, ${formatGramsLeft(selectedFilament.estimatedGramsLeft)} remaining${selectedIsAvailable ? "" : ", unavailable for this run"}` : "Choose inventory stock"}`}
        className="production-filament-picker__trigger"
        disabled={disabled}
        onClick={() => popupIsOpen ? closePicker() : openPicker()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openPicker(); }
        }}
        ref={triggerRef}
        type="button"
      >
        {selectedFilament ? <FilamentColorPreview filament={selectedFilament} /> : <span aria-hidden="true" className="production-filament-picker__swatch" />}
        <span className="production-filament-picker__identity">
          <strong>{selectedFilament ? getFilamentDisplayName(selectedFilament) : "Choose inventory stock…"}</strong>
          <small>{selectedFilament ? `${selectedFilament.colorName} · ${selectedFilament.materialType}${selectedIsAvailable ? "" : " · Unavailable for this run"}` : "Browse by color or search"}</small>
        </span>
        {selectedFilament ? <span className="production-filament-picker__amount">{formatGramsLeft(selectedFilament.estimatedGramsLeft)}</span> : null}
        <span aria-hidden="true" className="production-filament-picker__chevron">⌄</span>
      </button>
      {popup ? createPortal(popup, rootRef.current?.closest('[role="dialog"]') ?? document.body) : null}
    </div>
  );
}

function FilamentColorPreview({ filament }: { readonly filament: FilamentRecord }) {
  const color = normalizeHexColor(filament.hexColor);
  const validColor = /^#[0-9a-f]{6}$/i.test(color);
  return (
    <span
      aria-hidden="true"
      className="production-filament-picker__swatch"
      data-clear={getFilamentColorGroup(filament).id === "clear"}
      style={validColor ? { backgroundColor: color } : undefined}
      title={`${filament.colorName} ${validColor ? color : "(no color preview)"}`}
    />
  );
}
