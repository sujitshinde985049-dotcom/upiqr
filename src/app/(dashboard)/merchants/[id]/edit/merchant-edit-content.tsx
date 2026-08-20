"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { MerchantFormFields } from "@/components/merchants/MerchantFormFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { updateMerchantAction } from "@/lib/actions/merchant-actions";
import {
  merchantFormSchema,
  type MerchantFormInput,
} from "@/lib/validations/merchants";
import type { Client, Merchant } from "@/types";

interface MerchantEditPageContentProps {
  merchant: Merchant & { clientName: string };
  clients: Client[];
  isSuperAdmin: boolean;
}

export function MerchantEditPageContent({
  merchant,
  clients,
}: MerchantEditPageContentProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MerchantFormInput>({
    resolver: zodResolver(merchantFormSchema),
  });

  useEffect(() => {
    reset({
      currentAccountReference: merchant.currentAccountReference ?? "",
      accountHolderName: merchant.accountHolderName,
      businessName: merchant.businessName,
      merchantCategory: merchant.merchantCategory ?? "",
      businessType: merchant.businessType ?? "",
      gstNumber: merchant.gstNumber ?? "",
      pan: merchant.pan ?? "",
      mobile: merchant.mobile,
      email: merchant.email ?? "",
      address: merchant.address ?? "",
      city: merchant.city ?? "",
      district: merchant.district ?? "",
      state: merchant.state ?? "",
      pinCode: merchant.pinCode ?? "",
    });
  }, [merchant, reset]);

  const onSubmit = async (data: MerchantFormInput) => {
    const result = await updateMerchantAction({
      merchantId: merchant.id,
      ...data,
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Merchant updated successfully", {
      description: merchant.businessName,
    });
    router.push(`/merchants/${merchant.id}`);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Merchant"
        description={`${merchant.businessName} (${merchant.merchantCode})`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/merchants/${merchant.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Detail
            </Link>
          </Button>
        }
      />

      <p className="text-sm text-muted-foreground">
        Bank / Patsanstha: {merchant.clientName} — tenant assignment cannot be
        changed.
      </p>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <MerchantFormFields
              register={register}
              control={control}
              setValue={setValue}
              errors={errors}
              clients={clients}
              showClientSelector={false}
              clientId={merchant.clientId}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" asChild>
                <Link href={`/merchants/${merchant.id}`}>Cancel</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
