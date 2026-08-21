"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { onSelectValue } from "@/lib/utils/select";
import { updateMerchantQRAction } from "@/lib/actions/qr-actions";
import { updateMerchantQRSchema, type UpdateMerchantQRInput } from "@/lib/validations/qr";
import type { QRCode } from "@/types";

interface EditQRDialogProps {
  qr: (QRCode & { merchantName: string; clientName: string }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditQRDialog({ qr, open, onOpenChange }: EditQRDialogProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateMerchantQRInput>({
    resolver: zodResolver(updateMerchantQRSchema),
  });

  const status = watch("status");

  useEffect(() => {
    if (qr && open) {
      reset({
        qrId: qr.id,
        referenceName: qr.qrName,
        description: qr.description ?? "",
        category: qr.category ?? "",
        notes: qr.notes ?? "",
        status: qr.status === "inactive" ? "inactive" : "active",
      });
    }
  }, [qr, open, reset]);

  if (!qr) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit QR Code</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border border-amber-500/30 bg-amber-50/60 p-3 text-xs text-amber-900">
          TEST MODE — edits apply to the local mock QR record only. VPA, merchant, and
          provider identity cannot be changed.
        </div>

        <form
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            const result = await updateMerchantQRAction(values);
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            toast.success("QR code updated", { description: result.data.qrName });
            onOpenChange(false);
            router.refresh();
          })}
        >
          <input type="hidden" {...register("qrId")} />

          <div className="space-y-2">
            <Label htmlFor="referenceName">QR Name</Label>
            <Input id="referenceName" {...register("referenceName")} />
            {errors.referenceName && (
              <p className="text-xs text-destructive">{errors.referenceName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...register("description")} />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input id="category" {...register("category")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register("notes")} />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={onSelectValue((value) => setValue("status", value as "active" | "inactive"))}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
