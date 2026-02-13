import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Formats a numeric value to Brazilian format: x.xxx.xxx,xx
 * decimals: number of decimal places (default 2)
 */
function formatBRNumber(value: number, decimals = 2): string {
  if (value === 0) return "";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parses a Brazilian formatted string back to a number.
 * "1.234.567,89" -> 1234567.89
 */
function parseBRNumber(raw: string, decimals = 2): number {
  // Remove everything except digits
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  const num = parseInt(digits, 10) / Math.pow(10, decimals);
  return Number(num.toFixed(decimals));
}

function formatDigitsAsBR(digits: string, decimals = 2): string {
  if (!digits) return "";
  const num = parseInt(digits, 10) / Math.pow(10, decimals);
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

interface MaskedNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Numeric value (the real number, not formatted) */
  value: number;
  /** Called with the parsed numeric value */
  onValueChange: (value: number) => void;
  /** Number of decimal places (default: 2) */
  decimals?: number;
}

const MaskedNumberInput = React.forwardRef<HTMLInputElement, MaskedNumberInputProps>(
  ({ className, value, onValueChange, decimals = 2, onFocus, onBlur, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() =>
      value ? formatBRNumber(value, decimals) : ""
    );
    const [focused, setFocused] = React.useState(false);

    // Sync display when value changes externally (and not focused)
    React.useEffect(() => {
      if (!focused) {
        setDisplay(value ? formatBRNumber(value, decimals) : "");
      }
    }, [value, decimals, focused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const digits = raw.replace(/\D/g, "");
      
      if (!digits) {
        setDisplay("");
        onValueChange(0);
        return;
      }

      const formatted = formatDigitsAsBR(digits, decimals);
      setDisplay(formatted);
      onValueChange(parseBRNumber(formatted, decimals));
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      if (value === 0) setDisplay("");
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      setDisplay(value ? formatBRNumber(value, decimals) : "");
      onBlur?.(e);
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    );
  },
);
MaskedNumberInput.displayName = "MaskedNumberInput";

export { MaskedNumberInput, formatBRNumber, parseBRNumber };
