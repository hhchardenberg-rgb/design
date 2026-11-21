import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition-colors hover:border-foreground/25 placeholder:text-muted-foreground focus-visible:border-hhc-orange focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-hhc-orange/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition-colors hover:border-foreground/25 placeholder:text-muted-foreground focus-visible:border-hhc-orange focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-hhc-orange/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("mb-1.5 block text-sm font-semibold leading-none", className)} {...props} />
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition-colors hover:border-foreground/25 focus-visible:border-hhc-orange focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-hhc-orange/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border border-border accent-[var(--hhc-orange)] focus-visible:border-hhc-orange focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-hhc-orange/20",
        className
      )}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";
