"use client";

import type { ComponentProps } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;

type DialogContentProps = ComponentProps<typeof RadixDialog.Content> & {
  showClose?: boolean;
};

export function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <RadixDialog.Content
        className={cn(
          "dialog-content fixed z-50 bg-surface-1 border border-border-strong shadow-2xl",
          "inset-x-0 bottom-0 rounded-t-[var(--radius-xl)] max-h-[88vh]",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-[440px] sm:rounded-[var(--radius-lg)]",
          "overflow-y-auto focus:outline-none",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <RadixDialog.Close
            className="absolute right-4 top-4 rounded-full p-1.5 text-foreground-subtle hover:text-foreground hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} />
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export const DialogTitle = RadixDialog.Title;
export const DialogDescription = RadixDialog.Description;
export const DialogClose = RadixDialog.Close;
