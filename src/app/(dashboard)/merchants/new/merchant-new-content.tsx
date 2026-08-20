"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { MerchantFormFields } from "@/components/merchants/MerchantFormFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createMerchantAction } from "@/lib/actions/merchant-actions";
import {
  merchantFormSchema,
  type MerchantFormInput,
} from "@/lib/validations/merchants";
import type { Client } from "@/types";

interface MerchantNewPageContentProps {
  clients: Client[];
  isSuperAdmin: boolean;
  defaultClientId?: string;
}

export function MerchantNewPageContent({
  clients,
  isSuperAdmin,
  defaultClientId,
}: MerchantNewPageContentProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState(defaultClientId ?? "");

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MerchantFormInput>({
    resolver: zodResolver(merchantFormSchema),
  });

  const onSubmit = async (data: MerchantFormInput) => {
    if (isSuperAdmin && !clientId) {
      toast.error("Select Bank / Patsanstha");
      return;
    }

    const result = await createMerchantAction({
      ...data,
      ...(isSuperAdmin ? { clientId } : {}),
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Merchant onboarded successfully", {
      description: `${data.businessName} registered as ${result.data.merchantCode}.`,
    });
    router.push(`/merchants/${result.data.id}`);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboard Merchant"
        description="Register a current account holder under a Bank / Patsanstha"
        actions={
          <Button variant="outline" asChild>
            <Link href="/merchants">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Merchants
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <MerchantFormFields
              register={register}
              control={control}
              setValue={setValue}
              errors={errors}
              clients={clients}
              showClientSelector={isSuperAdmin}
              clientId={clientId}
              onClientChange={setClientId}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/merchants">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Merchant"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
