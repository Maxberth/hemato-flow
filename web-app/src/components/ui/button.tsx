import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 shadow-xs",
  {
    variants: {
      variant: {
        default:
          "bg-hemato-crimson text-white hover:bg-hemato-crimson-hover focus-visible:ring-hemato-crimson/40",
        crimson:
          "bg-hemato-crimson text-white hover:bg-hemato-crimson-hover focus-visible:ring-hemato-crimson/40",
        "tech-blue":
          "bg-tech-blue text-white hover:bg-tech-blue-hover focus-visible:ring-tech-blue/40",
        amber:
          "bg-warning-amber text-white hover:bg-warning-amber-hover focus-visible:ring-warning-amber/40",
        outline:
          "border-border bg-white text-deep-slate hover:bg-slate-50 hover:text-deep-slate hover:border-slate-300",
        secondary:
          "bg-slate-100 text-deep-slate hover:bg-slate-200/80 border-slate-200",
        ghost:
          "hover:bg-slate-100 text-deep-slate",
        destructive:
          "bg-red-50 text-hemato-crimson border border-red-200 hover:bg-red-100 focus-visible:border-hemato-crimson/40 focus-visible:ring-hemato-crimson/20",
        link: "text-tech-blue underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-2 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-lg px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-5 text-base font-semibold",
        icon: "size-9 rounded-xl",
        "icon-xs":
          "size-6 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-lg in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
