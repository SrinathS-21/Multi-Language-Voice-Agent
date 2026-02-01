/**
 * Reusable Confirmation Dialog Component
 * Modern UI replacement for window.confirm()
 */

"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, Info } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive" | "warning";
  onConfirm: () => void | Promise<void>;
  icon?: React.ReactNode;
}

/**
 * Confirmation Dialog Component
 * 
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 * 
 * <ConfirmDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Delete Document"
 *   description="Are you sure you want to delete 'Customer Support'?"
 *   variant="destructive"
 *   onConfirm={() => handleDelete()}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  onConfirm,
  icon,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error("Confirmation action failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Default icons based on variant
  const defaultIcon = icon || (
    variant === "destructive" ? (
      <Trash2 className="h-6 w-6 text-red-600" />
    ) : variant === "warning" ? (
      <AlertTriangle className="h-6 w-6 text-amber-600" />
    ) : (
      <Info className="h-6 w-6 text-blue-600" />
    )
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div className="mt-0.5">{defaultIcon}</div>
            <div className="flex-1">
              <AlertDialogTitle className="text-lg">{title}</AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={
              variant === "destructive"
                ? "bg-red-600 hover:bg-red-700 focus:ring-red-600"
                : variant === "warning"
                ? "bg-amber-600 hover:bg-amber-700 focus:ring-amber-600"
                : ""
            }
          >
            {isLoading ? "Processing..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Hook for managing confirmation dialog state
 * 
 * @example
 * ```tsx
 * const confirm = useConfirmDialog();
 * 
 * const handleDelete = async () => {
 *   const confirmed = await confirm.show({
 *     title: "Delete Document",
 *     description: "Are you sure?",
 *     variant: "destructive"
 *   });
 *   
 *   if (confirmed) {
 *     // Perform delete
 *   }
 * };
 * 
 * return <>{confirm.dialog}</>;
 * ```
 */
export function useConfirmDialog() {
  const [dialogProps, setDialogProps] = React.useState<Omit<ConfirmDialogProps, "open" | "onOpenChange" | "onConfirm"> | null>(null);
  const [open, setOpen] = React.useState(false);
  const resolveRef = React.useRef<((value: boolean) => void) | null>(null);

  const show = React.useCallback(
    (props: Omit<ConfirmDialogProps, "open" | "onOpenChange" | "onConfirm">) => {
      return new Promise<boolean>((resolve) => {
        setDialogProps(props);
        setOpen(true);
        resolveRef.current = resolve;
      });
    },
    []
  );

  const handleConfirm = React.useCallback(() => {
    resolveRef.current?.(true);
    setOpen(false);
  }, []);

  const handleCancel = React.useCallback(() => {
    resolveRef.current?.(false);
    setOpen(false);
  }, []);

  const dialog = dialogProps ? (
    <ConfirmDialog
      {...dialogProps}
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
      }}
      onConfirm={handleConfirm}
    />
  ) : null;

  return {
    show,
    dialog,
  };
}
