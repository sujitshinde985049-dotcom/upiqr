"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { ClientUserFormFields, MerchantUserFormFields } from "@/components/users/UserFormFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createClientUserAction,
  createMerchantUserAction,
} from "@/lib/actions/user-actions";
import {
  createClientUserSchema,
  createMerchantUserSchema,
  type CreateClientUserInput,
  type CreateMerchantUserInput,
} from "@/lib/validations/users";
import type { Client, MerchantWithStats } from "@/types";

interface UserNewPageContentProps {
  userType: "client" | "merchant";
  clients: Client[];
  merchants: MerchantWithStats[];
  isSuperAdmin: boolean;
  canCreateClientUsers: boolean;
  canCreateMerchantUsers: boolean;
  assignableRoles: Array<"client_admin" | "client_operator">;
  defaultClientId?: string;
  defaultMerchantId?: string;
}

export function UserNewPageContent({
  userType: initialType,
  clients,
  merchants,
  isSuperAdmin,
  canCreateClientUsers,
  canCreateMerchantUsers,
  assignableRoles,
  defaultClientId,
  defaultMerchantId,
}: UserNewPageContentProps) {
  const router = useRouter();
  const [userType, setUserType] = useState<"client" | "merchant">(initialType);
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [merchantId, setMerchantId] = useState(defaultMerchantId ?? "");

  const clientForm = useForm<CreateClientUserInput>({
    resolver: zodResolver(createClientUserSchema),
    defaultValues: {
      role: assignableRoles[0] ?? "client_operator",
      status: "active",
    },
  });

  const merchantForm = useForm<CreateMerchantUserInput>({
    resolver: zodResolver(createMerchantUserSchema),
    defaultValues: { status: "active" },
  });

  const onSubmitClientUser = async (data: CreateClientUserInput) => {
    if (isSuperAdmin && !clientId) {
      toast.error("Select Bank / Patsanstha");
      return;
    }

    const result = await createClientUserAction({
      ...data,
      ...(isSuperAdmin ? { clientId } : {}),
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Client user created successfully");
    router.push("/users");
    router.refresh();
  };

  const onSubmitMerchantUser = async (data: CreateMerchantUserInput) => {
    if (!merchantId) {
      toast.error("Select a Merchant");
      return;
    }

    const result = await createMerchantUserAction({
      ...data,
      merchantId,
      ...(isSuperAdmin ? { clientId } : {}),
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Merchant user created successfully");
    router.push("/users");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add User"
        description="Create a client user or merchant user with role-based access"
        actions={
          <Button variant="outline" asChild>
            <Link href="/users">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Users
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <Tabs
            value={userType}
            onValueChange={(v) => setUserType(v as "client" | "merchant")}
          >
            <TabsList>
              {canCreateClientUsers && (
                <TabsTrigger value="client">Client User</TabsTrigger>
              )}
              {canCreateMerchantUsers && (
                <TabsTrigger value="merchant">Merchant User</TabsTrigger>
              )}
            </TabsList>

            {canCreateClientUsers && (
              <TabsContent value="client" className="mt-4">
                <form
                  onSubmit={clientForm.handleSubmit(onSubmitClientUser)}
                  className="space-y-4"
                >
                  <ClientUserFormFields
                    register={clientForm.register}
                    control={clientForm.control}
                    setValue={clientForm.setValue}
                    errors={clientForm.formState.errors}
                    clients={clients}
                    showClientSelector={isSuperAdmin}
                    assignableRoles={assignableRoles}
                    clientId={clientId}
                    onClientChange={setClientId}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" asChild>
                      <Link href="/users">Cancel</Link>
                    </Button>
                    <Button
                      type="submit"
                      disabled={clientForm.formState.isSubmitting}
                    >
                      {clientForm.formState.isSubmitting
                        ? "Creating..."
                        : "Create Client User"}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            )}

            {canCreateMerchantUsers && (
              <TabsContent value="merchant" className="mt-4">
                <form
                  onSubmit={merchantForm.handleSubmit(onSubmitMerchantUser)}
                  className="space-y-4"
                >
                  <MerchantUserFormFields
                    register={merchantForm.register}
                    control={merchantForm.control}
                    setValue={merchantForm.setValue}
                    errors={merchantForm.formState.errors}
                    clients={clients}
                    merchants={merchants}
                    showClientSelector={isSuperAdmin}
                    clientId={clientId}
                    merchantId={merchantId}
                    onClientChange={(v) => {
                      setClientId(v);
                      setMerchantId("");
                    }}
                    onMerchantChange={setMerchantId}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" asChild>
                      <Link href="/users">Cancel</Link>
                    </Button>
                    <Button
                      type="submit"
                      disabled={merchantForm.formState.isSubmitting}
                    >
                      {merchantForm.formState.isSubmitting
                        ? "Creating..."
                        : "Create Merchant User"}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
