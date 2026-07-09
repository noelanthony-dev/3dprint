import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

import type { ProductRecord } from "@/domain/products";

interface ProductDesignComboboxProps {
  readonly emptyLabel?: string;
  readonly fallbackLabel?: string;
  readonly onSelect: (product: ProductRecord | null) => void;
  readonly placeholder?: string;
  readonly products: readonly ProductRecord[];
  readonly selectedProductId: string;
}

export function ProductDesignCombobox({
  emptyLabel = "No products match this search.",
  fallbackLabel = "",
  onSelect,
  placeholder = "Type product/design...",
  products,
  selectedProductId,
}: ProductDesignComboboxProps) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const selectedProduct = products.find((product) => String(product.id) === selectedProductId) ?? null;
  const selectedDisplay = selectedProduct?.designName ?? fallbackLabel;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(selectedDisplay);

  useEffect(() => {
    if (!isOpen) {
      setQuery(selectedDisplay);
    }
  }, [isOpen, selectedDisplay]);

  const filteredProducts = useMemo(
    () => filterProducts(query, products),
    [products, query],
  );
  const boundedActiveIndex =
    filteredProducts.length > 0
      ? Math.min(activeIndex, filteredProducts.length - 1)
      : -1;
  const activeProduct = boundedActiveIndex >= 0 ? filteredProducts[boundedActiveIndex] : null;

  function openWithSelection(): void {
    setIsOpen(true);
    setActiveIndex(Math.max(0, filteredProducts.findIndex((product) => String(product.id) === selectedProductId)));
  }

  function handleQueryChange(value: string): void {
    setQuery(value);
    setIsOpen(true);
    setActiveIndex(0);

    if (!value.trim() && selectedProductId) {
      onSelect(null);
    }
  }

  function chooseProduct(product: ProductRecord): void {
    onSelect(product);
    setQuery(product.designName);
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        filteredProducts.length === 0 ? 0 : (current + 1) % filteredProducts.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        filteredProducts.length === 0
          ? 0
          : (current - 1 + filteredProducts.length) % filteredProducts.length,
      );
      return;
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();

      if (activeProduct) {
        chooseProduct(activeProduct);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setQuery(selectedDisplay);
    }
  }

  return (
    <div
      className="product-design-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <input
        aria-activedescendant={isOpen && activeProduct ? getProductOptionId(listboxId, activeProduct) : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        autoComplete="off"
        id={inputId}
        onChange={(event) => handleQueryChange(event.target.value)}
        onFocus={openWithSelection}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        value={query}
      />
      {isOpen ? (
        <div className="product-design-combobox__menu" id={listboxId} role="listbox">
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product, index) => {
              const isActive = index === boundedActiveIndex;
              const isSelected = String(product.id) === selectedProductId;

              return (
                <div
                  aria-selected={isSelected}
                  className="product-design-combobox__option"
                  data-active={isActive ? "true" : "false"}
                  data-selected={isSelected ? "true" : "false"}
                  id={getProductOptionId(listboxId, product)}
                  key={product.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseProduct(product);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                >
                  <span className="product-design-combobox__label">
                    <strong>{product.designName}</strong>
                    <span>{product.authorName || product.sourceLink || "No source info"}</span>
                  </span>
                  <span className="product-design-combobox__meta">
                    {product.category}
                    <small>{product.saleUnit}</small>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="product-design-combobox__empty">{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function filterProducts(
  query: string,
  products: readonly ProductRecord[],
): readonly ProductRecord[] {
  const normalized = normalizeQuery(query);

  if (!normalized) {
    return products;
  }

  return products.filter((product) =>
    [
      product.designName,
      product.authorName,
      product.category,
      product.saleUnit,
      product.sourceLink,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function getProductOptionId(listboxId: string, product: ProductRecord): string {
  return `${listboxId}-option-${product.id}`;
}
