"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateMerchantQRAction } from "@/lib/actions/qr-actions";
import type { Merchant } from "@/types";

const formSchema = z.object({
  merchantId: z.string().min(1, "Select Merchant"),
  railId: z.enum(["HDFC", "ICICI"]),
  qrName: z.string().trim().min(3).max(100),
  qrIdentifier: z.string().trim().optional(),
  maxAmountPerTransaction: z.string().optional(),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface GenerateQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchants: Merchant[];
  defaultMerchantId?: string;
  lockMerchant?: boolean;
}

export function GenerateQRDialog({
  open,
  onOpenChange,
  merchants,
  defaultMerchantId,
  lockMerchant = false,
}: GenerateQRDialogProps) {
  const router = useRouter();
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      merchantId: defaultMerchantId ?? "",
      railId: "HDFC",
    },
  });

  const merchantId = watch("merchantId");
  const railId = watch("railId");

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      reset({
        merchantId: defaultMerchantId ?? "",
        railId: "HDFC",
        qrName: "",
        qrIdentifier: "",
        maxAmountPerTransaction: "",
        description: "",
        category: "",
        notes: "",
      });
    }
  }, [open, defaultMerchantId, reset]);

  useEffect(() => {
    if (defaultMerchantId) {
      setValue("merchantId", defaultMerchantId);
    }
  }, [defaultMerchantId, setValue]);

  const selectedMerchant = useMemo(
    () => merchants.find((m) => m.id === merchantId),
    [merchants, merchantId]
  );

  const onSubmit = async (data: FormData) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await generateMerchantQRAction({
        ...data,
        idempotencyKey,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.idempotentReplay
          ? "QR already created for this submission"
          : "TEST QR created successfully",
        {
          description: `${result.data.qrName} — NOT PAYABLE`,
        }
      );
      onOpenChange(false);
      router.push(`/qr-codes/${result.data.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate TEST QR Code</DialogTitle>
          <DialogDescription>
            TEST MODE — No live SabPaisa API call will be made.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Mock SabPaisa contract mode. Generated QR records are TEST only and
            are <strong>NOT PAYABLE</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {!lockMerchant && (
            <div className="space-y-2">
              <Label>Merchant</Label>
              <Select
                value={merchantId}
                onValueChange={(v) => v && setValue("merchantId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select merchant" />
                </SelectTrigger>
                <SelectContent>
                  {merchants.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.businessName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.merchantId && (
                <p className="text-xs text-destructive">{errors.merchantId.message}</p>
              )}
            </div>
          )}

          {lockMerchant && selectedMerchant && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Merchant</p>
              <p className="font-medium">{selectedMerchant.businessName}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Payment Rail</Label>
            <Select
              value={railId}
              onValueChange={(v) => v && setValue("railId", v as FormData["railId"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HDFC">HDFC</SelectItem>
                <SelectItem value="ICICI">ICICI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qrName">QR Name</Label>
            <Input id="qrName" {...register("qrName")} />
            {errors.qrName && (
              <p className="text-xs text-destructive">{errors.qrName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="qrIdentifier">QR Identifier (optional)</Label>
            <Input id="qrIdentifier" placeholder="e.g. shop01" {...register("qrIdentifier")} />
            {errors.qrIdentifier && (
              <p className="text-xs text-destructive">{errors.qrIdentifier.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxAmount">Max Amount Per Transaction (optional)</Label>
            <Input
              id="maxAmount"
              type="number"
              {...register("maxAmountPerTransaction")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} />
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
            <Textarea id="notes" {...register("notes")} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Generating..." : "Generate TEST QR"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
