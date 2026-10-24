import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("btn inline-flex items-center justify-center font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: { default: "btn-primary", dark: "btn-dark", outline: "btn-outline", ghost: "" },
    size: { default: "", large: "btn-large" }
  },
  defaultVariants: { variant: "default", size: "default" }
});

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props}/>;
}
