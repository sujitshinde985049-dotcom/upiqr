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
import { ClientFormFields } from "@/components/clients/ClientFormFields";
import { updateClientAction } from "@/lib/actions/client-actions";
import { clientFormSchema, type ClientFormInput } from "@/lib/validations/clients";
import type { Client } from "@/types";

interface EditClientDialogProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditClientDialog({
  client,
  open,
  onOpenChange,
}: EditClientDialogProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
  });

  useEffect(() => {
    if (client && open) {
      reset({
        name: client.name,
        type: client.type,
        registrationNumber: client.registrationNumber ?? "",
        contactPerson: client.contactPerson,
        mobile: client.mobile,
        email: client.email,
        address: client.address ?? "",
        city: client.city ?? "",
        district: client.district ?? "",
        state: client.state ?? "",
        pinCode: client.pinCode ?? "",
      });
    }
  }, [client, open, reset]);

  const onSubmit = async (data: ClientFormInput) => {
    if (!client) return;

    const result = await updateClientAction({
      clientId: client.id,
      ...data,
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Client updated successfully", {
      description: `${data.name} has been saved.`,
    });
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <ClientFormFields
            register={register}
            control={control}
            setValue={setValue}
            errors={errors}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !client}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
