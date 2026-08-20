"use client";

import type {
  UseFormRegister,
  FieldErrors,
  Control,
  UseFormSetValue,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientSelector } from "@/components/shared/ClientSelector";
import { MerchantSelector } from "@/components/shared/MerchantSelector";
import type {
  CreateClientUserInput,
  CreateMerchantUserInput,
} from "@/lib/validations/users";
import type { Client, MerchantWithStats } from "@/types";

interface ClientUserFormFieldsProps {
  register: UseFormRegister<CreateClientUserInput>;
  control: Control<CreateClientUserInput>;
  setValue: UseFormSetValue<CreateClientUserInput>;
  errors: FieldErrors<CreateClientUserInput>;
  clients: Client[];
  showClientSelector: boolean;
  assignableRoles: Array<"client_admin" | "client_operator">;
  clientId?: string;
  onClientChange?: (clientId: string) => void;
}

export function ClientUserFormFields({
  register,
  control,
  setValue,
  errors,
  clients,
  showClientSelector,
  assignableRoles,
  clientId,
  onClientChange,
}: ClientUserFormFieldsProps) {
  const roleValue = useWatch({ control, name: "role" });
  const statusValue = useWatch({ control, name: "status" });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <Select
          value={roleValue}
          onValueChange={(v) =>
            v && setValue("role", v as "client_admin" | "client_operator")
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {assignableRoles.includes("client_admin") && (
              <SelectItem value="client_admin">Client Admin</SelectItem>
            )}
            {assignableRoles.includes("client_operator") && (
              <SelectItem value="client_operator">Client Operator</SelectItem>
            )}
          </SelectContent>
        </Select>
        {errors.role && (
          <p className="text-xs text-destructive">{errors.role.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={statusValue}
          onValueChange={(v) =>
            v && setValue("status", v as "active" | "inactive")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showClientSelector && (
        <div className="sm:col-span-2 space-y-2">
          <Label>Bank / Patsanstha</Label>
          <ClientSelector
            clients={clients}
            value={clientId}
            onChange={(v) => onClientChange?.(v)}
          />
        </div>
      )}
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="password">Temporary Password</Label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Minimum 8 characters with uppercase letter and number.
        </p>
      </div>
    </div>
  );
}

interface MerchantUserFormFieldsProps {
  register: UseFormRegister<CreateMerchantUserInput>;
  control: Control<CreateMerchantUserInput>;
  setValue: UseFormSetValue<CreateMerchantUserInput>;
  errors: FieldErrors<CreateMerchantUserInput>;
  clients: Client[];
  merchants: MerchantWithStats[];
  showClientSelector: boolean;
  clientId?: string;
  merchantId?: string;
  onClientChange?: (clientId: string) => void;
  onMerchantChange?: (merchantId: string) => void;
}

export function MerchantUserFormFields({
  register,
  control,
  setValue,
  errors,
  clients,
  merchants,
  showClientSelector,
  clientId,
  merchantId,
  onClientChange,
  onMerchantChange,
}: MerchantUserFormFieldsProps) {
  const statusValue = useWatch({ control, name: "status" });
  const filteredMerchants = clientId
    ? merchants.filter((m) => m.clientId === clientId)
    : merchants;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>
      {showClientSelector && (
        <div className="sm:col-span-2 space-y-2">
          <Label>Bank / Patsanstha</Label>
          <ClientSelector
            clients={clients}
            value={clientId}
            onChange={(v) => onClientChange?.(v)}
          />
        </div>
      )}
      <div className="sm:col-span-2 space-y-2">
        <Label>Merchant</Label>
        <MerchantSelector
          merchants={filteredMerchants}
          value={merchantId}
          onChange={(v) => onMerchantChange?.(v)}
        />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={statusValue}
          onValueChange={(v) =>
            v && setValue("status", v as "active" | "inactive")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="password">Temporary Password</Label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Minimum 8 characters with uppercase letter and number.
        </p>
      </div>
    </div>
  );
}
