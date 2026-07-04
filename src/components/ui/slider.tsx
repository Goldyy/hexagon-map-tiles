import * as SliderPrimitive from "@radix-ui/react-slider";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export const Slider = forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-[2px] bg-[#ececec]">
      <SliderPrimitive.Range className="absolute h-full bg-[#111]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block size-[17px] rounded-full border-[1.5px] border-[#111] bg-white shadow-[0_2px_5px_rgba(0,0,0,.12)] outline-none ring-offset-2 transition focus-visible:ring-2 focus-visible:ring-[#111]" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;
