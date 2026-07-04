import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Two shapes carry the whole redesign: a black `.primary` and a hairline-bordered
// white `.ghost`. Height, radius, and font-size are set per-use via className;
// the variant only fixes colour, weight, and hover/active behaviour.
const variants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[9px] font-medium transition-[background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "h-9 border border-transparent bg-[#111] px-[17px] text-[12.5px] font-semibold text-white hover:bg-black active:translate-y-px",
        outline:
          "h-9 border border-[#e0ded8] bg-white px-[15px] text-[12.5px] font-medium text-[#444] hover:border-[#d4d1c9] hover:bg-[#faf9f7]",
        ghost: "px-3 py-2 text-[#555] hover:bg-black/5",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> {}

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(variants({ variant }), className)} {...props} />;
}
