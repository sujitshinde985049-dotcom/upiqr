"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Client } from "@/types";

interface ClientSelectorProps {
  clients: Client[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  includeAll?: boolean;
  className?: string;
}

export function ClientSelector({
  clients,
  value,
  onChange,
  placeholder = "Select Bank / Patsanstha",
  includeAll = false,
  className,
}: ClientSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">All Clients</SelectItem>}
        {clients.map((client) => (
          <SelectItem key={client.id} value={client.id}>
            {client.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
