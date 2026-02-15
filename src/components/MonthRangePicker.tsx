import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface MonthRangeValue {
  start: { year: number; month: number };
  end: { year: number; month: number };
}

interface MonthRangePickerProps {
  value: MonthRangeValue | null;
  onChange: (value: MonthRangeValue | null) => void;
  disabled?: boolean;
}

export function MonthRangePicker({ value, onChange, disabled }: MonthRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selecting, setSelecting] = useState<"start" | "end">("start");
  const [tempStart, setTempStart] = useState<{ year: number; month: number } | null>(null);
  const [tempEnd, setTempEnd] = useState<{ year: number; month: number } | null>(null);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setTempStart(value?.start || null);
      setTempEnd(value?.end || null);
      setSelecting(value?.start ? "end" : "start");
      setYear(value?.start?.year || new Date().getFullYear());
    }
    setOpen(isOpen);
  };

  const handleMonthClick = (month: number) => {
    const clicked = { year, month };
    if (selecting === "start") {
      setTempStart(clicked);
      setTempEnd(null);
      setSelecting("end");
    } else {
      const startVal = tempStart!;
      const clickedVal = year * 12 + month;
      const startNumeric = startVal.year * 12 + startVal.month;
      if (clickedVal < startNumeric) {
        setTempEnd(startVal);
        setTempStart(clicked);
      } else {
        setTempEnd(clicked);
      }
    }
  };

  const handleConfirm = () => {
    if (tempStart && tempEnd) {
      onChange({ start: tempStart, end: tempEnd });
      setOpen(false);
    }
  };

  const handleClear = () => {
    onChange(null);
    setTempStart(null);
    setTempEnd(null);
    setSelecting("start");
    setOpen(false);
  };

  const isInRange = (month: number) => {
    if (!tempStart) return false;
    const val = year * 12 + month;
    const startVal = tempStart.year * 12 + tempStart.month;
    if (!tempEnd) return val === startVal;
    const endVal = tempEnd.year * 12 + tempEnd.month;
    return val >= startVal && val <= endVal;
  };

  const isStart = (month: number) => tempStart?.year === year && tempStart?.month === month;
  const isEnd = (month: number) => tempEnd?.year === year && tempEnd?.month === month;

  const formatDisplay = () => {
    if (!value) return "Selecione...";
    const s = value.start;
    const e = value.end;
    return `${MONTHS_PT[s.month - 1]}/${String(s.year).slice(2)} a ${MONTHS_PT[e.month - 1]}/${String(e.year).slice(2)}`;
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal h-10" disabled={disabled}>
          <span className={!value ? "text-muted-foreground" : ""}>{formatDisplay()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 pointer-events-auto" align="start">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => setYear(y => y - 1)} className="p-1 hover:bg-accent rounded">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-medium">{year}</span>
          <button type="button" onClick={() => setYear(y => y + 1)} className="p-1 hover:bg-accent rounded">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {MONTHS_PT.map((name, i) => {
            const month = i + 1;
            const inRange = isInRange(month);
            const start = isStart(month);
            const end = isEnd(month);
            return (
              <button
                type="button"
                key={name}
                onClick={() => handleMonthClick(month)}
                className={`px-2 py-1.5 text-sm rounded transition-colors ${
                  start || end
                    ? "bg-primary text-primary-foreground"
                    : inRange
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-accent"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>Limpar</Button>
          <Button type="button" size="sm" onClick={handleConfirm} disabled={!tempStart || !tempEnd}>OK</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
