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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientSelector } from "@/components/shared/ClientSelector";
import { INDIAN_STATES } from "@/lib/constants/states";
import type { MerchantFormInput } from "@/lib/validations/merchants";
import type { Client } from "@/types";

interface MerchantFormFieldsProps {
  register: UseFormRegister<MerchantFormInput>;
  control: Control<MerchantFormInput>;
  setValue: UseFormSetValue<MerchantFormInput>;
  errors: FieldErrors<MerchantFormInput>;
  clients?: Client[];
  showClientSelector?: boolean;
  clientId?: string;
  onClientChange?: (clientId: string) => void;
}

export function MerchantFormFields({
  register,
  control,
  setValue,
  errors,
  clients,
  showClientSelector = false,
  clientId,
  onClientChange,
}: MerchantFormFieldsProps) {
  const stateValue = useWatch({ control, name: "state" });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Bank Relationship</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {showClientSelector && clients && (
            <div className="sm:col-span-2 space-y-2">
              <Label>Bank / Patsanstha</Label>
              <ClientSelector
                clients={clients}
                value={clientId}
                onChange={(v) => onClientChange?.(v)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="currentAccountReference">
              Current Account Reference
            </Label>
            <Input
              id="currentAccountReference"
              placeholder="e.g. CA-SN-2024-0004"
              {...register("currentAccountReference")}
            />
            {errors.currentAccountReference && (
              <p className="text-xs text-destructive">
                {errors.currentAccountReference.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountHolderName">Account Holder Name</Label>
            <Input id="accountHolderName" {...register("accountHolderName")} />
            {errors.accountHolderName && (
              <p className="text-xs text-destructive">
                {errors.accountHolderName.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Business Details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="businessName">Business Name</Label>
            <Input id="businessName" {...register("businessName")} />
            {errors.businessName && (
              <p className="text-xs text-destructive">
                {errors.businessName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="merchantCategory">Merchant Category</Label>
            <Input id="merchantCategory" {...register("merchantCategory")} />
            {errors.merchantCategory && (
              <p className="text-xs text-destructive">
                {errors.merchantCategory.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessType">Business Type</Label>
            <Input
              id="businessType"
              placeholder="Proprietorship"
              {...register("businessType")}
            />
            {errors.businessType && (
              <p className="text-xs text-destructive">
                {errors.businessType.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstNumber">GST Number (Optional)</Label>
            <Input id="gstNumber" {...register("gstNumber")} />
            {errors.gstNumber && (
              <p className="text-xs text-destructive">{errors.gstNumber.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pan">PAN (Optional)</Label>
            <Input id="pan" {...register("pan")} />
            {errors.pan && (
              <p className="text-xs text-destructive">{errors.pan.message}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Contact</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile</Label>
            <Input id="mobile" {...register("mobile")} />
            {errors.mobile && (
              <p className="text-xs text-destructive">{errors.mobile.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (Optional)</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Address</h3>
        <div className="grid gap-4 sm:grid-cols-2">
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
              <p className="text-xs text-destructive">
                {errors.district.message}
              </p>
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
      </div>
    </div>
  );
}
