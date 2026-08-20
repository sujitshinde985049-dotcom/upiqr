"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Merchant } from "@/types";

interface MerchantSelectorProps {
  merchants: Merchant[];
  value?: string;
  onChange: (value: string) => void;
  clientId?: string;
  placeholder?: string;
  includeAll?: boolean;
  className?: string;
}

export function MerchantSelector({
  merchants,
  value,
  onChange,
  clientId,
  placeholder = "Select Merchant",
  includeAll = false,
  className,
}: MerchantSelectorProps) {
  const filtered = clientId
    ? merchants.filter((m) => m.clientId === clientId)
    : merchants;

  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">All Merchants</SelectItem>}
        {filtered.map((merchant) => (
          <SelectItem key={merchant.id} value={merchant.id}>
            {merchant.businessName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
