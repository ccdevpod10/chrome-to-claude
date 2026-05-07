import { useRef, useState } from "react";
import type { Action } from "../../core/messages";

interface FollowUpInputProps {
  disabled: boolean;
  onSubmit: (action: Action, freeText?: string) => void;
}

const QUICK_CHIPS: { label: string; action: Action }[] = [
  { label: "Review", action: "review" },
  { label: "Fix", action: "fix" },
  { label: "Debug", action: "debug" },
  { label: "Generate", action: "generate" },
];

export default function FollowUpInput({ disabled, onSubmit }: FollowUpInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      onSubmit("improve", value.trim());
      setValue("");
    }
  };

  return (
    <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur px-3 pt-2 pb-3 space-y-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask a follow-up…"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-[12px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--border-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      />
      <div className="flex gap-1.5 flex-wrap">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.action}
            onClick={() => onSubmit(chip.action)}
            disabled={disabled}
            className="rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-[11px] font-medium text-neutral-300 hover:bg-[var(--bg-elev-2)] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
