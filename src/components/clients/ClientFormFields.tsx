"use client";

import type { UseFormRegister, FieldErrors, Control, UseFormSetValue } from "react-hook-form";
import { useWatch } from "react-hook-form";
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
import { INDIAN_STATES } from "@/lib/constants/states";
import type { ClientFormInput } from "@/lib/validations/clients";

interface ClientFormFieldsProps {
  register: UseFormRegister<ClientFormInput>;
  control: Control<ClientFormInput>;
  setValue: UseFormSetValue<ClientFormInput>;
  errors: FieldErrors<ClientFormInput>;
}

export function ClientFormFields({
  register,
  control,
  setValue,
  errors,
}: ClientFormFieldsProps) {
  const typeValue = useWatch({ control, name: "type" });
  const stateValue = useWatch({ control, name: "state" });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="name">Institution Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Client Type</Label>
        <Select
          value={typeValue}
          onValueChange={(v) => v && setValue("type", v as "bank" | "patsanstha")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bank">Bank</SelectItem>
            <SelectItem value="patsanstha">Patsanstha</SelectItem>
          </SelectContent>
        </Select>
        {errors.type && (
          <p className="text-xs text-destructive">{errors.type.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="registrationNumber">Registration Number</Label>
        <Input id="registrationNumber" {...register("registrationNumber")} />
        {errors.registrationNumber && (
          <p className="text-xs text-destructive">
            {errors.registrationNumber.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactPerson">Contact Person</Label>
        <Input id="contactPerson" {...register("contactPerson")} />
        {errors.contactPerson && (
          <p className="text-xs text-destructive">
            {errors.contactPerson.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="mobile">Mobile</Label>
        <Input id="mobile" {...register("mobile")} />
        {errors.mobile && (
          <p className="text-xs text-destructive">{errors.mobile.message}</p>
        )}
      </div>
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" {...register("address")} />
        {errors.address && (
          <p className="text-xs text-destructive">{errors.address.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="city">City</Label>
        <Input id="city" {...register("city")} />
        {errors.city && (
          <p className="text-xs text-destructive">{errors.city.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="district">District</Label>
        <Input id="district" {...register("district")} />
        {errors.district && (
          <p className="text-xs text-destructive">{errors.district.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>State</Label>
        <Select
          value={stateValue}
          onValueChange={(v) => v && setValue("state", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select state" />
          </SelectTrigger>
          <SelectContent>
            {INDIAN_STATES.map((state) => (
              <SelectItem key={state} value={state}>
                {state}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.state && (
          <p className="text-xs text-destructive">{errors.state.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="pinCode">PIN Code</Label>
        <Input id="pinCode" {...register("pinCode")} />
        {errors.pinCode && (
          <p className="text-xs text-destructive">{errors.pinCode.message}</p>
        )}
      </div>
    </div>
  );
}
