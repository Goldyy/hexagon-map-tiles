import { Check } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

/**
 * A labelled checkbox: a native `<input type="checkbox">` visually hidden behind
 * a peer-driven box so it stays keyboard reachable and screen-reader labelled.
 * Unchecked reads as a hairline outline; checked fills solid black with a white
 * tick — the redesign's only accent.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-[11px] text-[13px] text-[#555]",
        props.disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      htmlFor={id}
    >
      <span className="relative inline-flex">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className="peer size-[18px] cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-[#d8d5cd] bg-white outline-none transition checked:border-[#111] checked:bg-[#111] focus-visible:ring-2 focus-visible:ring-[#111] focus-visible:ring-offset-2 disabled:cursor-not-allowed"
          {...props}
        />
        <Check
          size={12}
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto hidden text-white peer-checked:block"
          aria-hidden
        />
      </span>
      {label}
    </label>
  ),
);
Checkbox.displayName = "Checkbox";
