"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  KeyboardEvent,
  SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type ModernSelectOption = {
  value: string | number;
  label: string;
  disabled?: boolean;
};

type ModernSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children" | "onChange" | "size" | "value" | "defaultValue"
> & {
  options: ModernSelectOption[];
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  onValueChange?: (value: string) => void;
};

export function ModernSelect({
  options,
  value,
  defaultValue,
  placeholder,
  onValueChange,
  className = "",
  disabled,
  required,
  name,
  id,
  "aria-label": ariaLabel,
  ...selectProps
}: ModernSelectProps) {
  const generatedId = useId();
  const buttonId = id || `modern-select-${generatedId}`;
  const listboxId = `${buttonId}-listbox`;

  const isControlled = value !== undefined;
  const initialValue = String(
    defaultValue ??
    (placeholder ? "" : options.find((option) => !option.disabled)?.value ?? "")
  );

  const [internalValue, setInternalValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [invalid, setInvalid] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedValue = isControlled ? String(value) : internalValue;
  const selectedIndex = options.findIndex(
    (option) => String(option.value) === selectedValue
  );
  const selectedOption = options[selectedIndex];

  // Close listbox on outside click
  useEffect(() => {
    function handlePointerDownOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || activeIndex < 0) return;

    const activeOption = rootRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`
    );
    activeOption?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function getFirstEnabledIndex() {
    return options.findIndex((option) => !option.disabled);
  }

  function getLastEnabledIndex() {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index].disabled) return index;
    }
    return -1;
  }

  function getNextEnabledIndex(startIndex: number, direction: 1 | -1) {
    if (!options.length) return -1;
    let nextIdx = startIndex;

    for (let count = 0; count < options.length; count += 1) {
      nextIdx = (nextIdx + direction + options.length) % options.length;
      if (!options[nextIdx].disabled) return nextIdx;
    }

    return -1;
  }

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(
      selectedIndex >= 0 && !options[selectedIndex].disabled
        ? selectedIndex
        : getFirstEnabledIndex()
    );
  }

  function handleSelect(option: ModernSelectOption) {
    if (option.disabled) return;

    const nextValue = String(option.value);
    if (!isControlled) {
      setInternalValue(nextValue);
    }

    setInvalid(false);
    setOpen(false);
    onValueChange?.(nextValue);
    buttonRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) openMenu();
      setActiveIndex(
        event.key === "Home" ? getFirstEnabledIndex() : getLastEnabledIndex()
      );
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;

      if (!open) {
        openMenu();
      } else {
        setActiveIndex((current) => getNextEnabledIndex(current, direction));
      }
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      if (activeIndex >= 0 && options[activeIndex]) {
        handleSelect(options[activeIndex]);
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={`modern-select ${className}`}
      data-open={open || undefined}
    >
      {/* Hidden native select for form submission and validation */}
      <select
        {...selectProps}
        className="modern-select-native"
        name={name}
        value={selectedValue}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          if (!isControlled) {
            setInternalValue(event.target.value);
          }
          onValueChange?.(event.target.value);
        }}
        onInvalid={(event) => {
          event.preventDefault();
          setInvalid(true);
          buttonRef.current?.focus();
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option
            key={String(option.value)}
            value={String(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>

      {/* Visible Combobox Trigger */}
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className="modern-select-trigger"
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-invalid={invalid || undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className={selectedOption ? "" : "modern-select-placeholder"}>
          {selectedOption?.label || placeholder || "Select an option"}
        </span>
        <ChevronDown
          className="modern-select-chevron"
          size={18}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          id={listboxId}
          className="modern-select-menu"
          role="listbox"
          aria-labelledby={buttonId}
        >
          {placeholder && !required && (
            <button
              type="button"
              role="option"
              aria-selected={selectedValue === ""}
              className="modern-select-option"
              onClick={() => handleSelect({ value: "", label: placeholder })}
            >
              <span>{placeholder}</span>
              {selectedValue === "" && <Check size={17} aria-hidden="true" />}
            </button>
          )}

          {options.map((option, index) => {
            const isSelected = String(option.value) === selectedValue;
            const isActive = activeIndex === index;

            return (
              <button
                key={String(option.value)}
                id={`${listboxId}-option-${index}`}
                data-option-index={index}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`modern-select-option ${isActive ? "is-active" : ""}`}
                onPointerMove={() => !option.disabled && setActiveIndex(index)}
                onClick={() => handleSelect(option)}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={17} aria-hidden="true" />}
              </button>
            );
          })}

          {!options.length && (
            <div className="modern-select-empty">No options available</div>
          )}
        </div>
      )}
    </div>
  );
}