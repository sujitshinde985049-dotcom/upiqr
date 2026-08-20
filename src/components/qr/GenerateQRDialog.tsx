"use client";

import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GenerateQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients?: unknown[];
  merchants?: unknown[];
  defaultClientId?: string;
  defaultMerchantId?: string;
}

export function GenerateQRDialog({
  open,
  onOpenChange,
}: GenerateQRDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate QR Code</DialogTitle>
          <DialogDescription>
            Live SabPaisa QR generation is not available in Phase 3.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p>
                SabPaisa QR generation will be enabled in Phase 4. No SabPaisa
                API calls are made from this application yet.
              </p>
              <p>
                Existing QR records in the database are development/demo data
                only and are not linked to live payment processing.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
