import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// The bare field that sits inside the location wrapper (the hairline border,
// leading dot, and radius live on that wrapper in App.tsx). Space Mono, so the
// typed `lat, lon` reads as a technical value rather than prose.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "font-mono w-full border-none bg-transparent text-[12.5px] text-[#111] outline-none placeholder:text-[#b8b4ab]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
