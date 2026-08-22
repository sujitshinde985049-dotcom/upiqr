"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Settings,
  Plug,
  Bell,
  Building2,
} from "lucide-react";
import type { UserRole } from "@prisma/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateClientSettingsAction,
  updatePlatformSettingsAction,
} from "@/lib/actions/settings-actions";
import type {
  ClientSettingsView,
  PlatformSettingsView,
} from "@/lib/services/settings-service";
import type { IntegrationReadiness } from "@/types";

interface SettingsPageContentProps {
  userRole: UserRole;
  platformSettings: PlatformSettingsView | null;
  clientSettings: ClientSettingsView | null;
  clients: { id: string; name: string }[];
  selectedClientId: string | null;
  integrationReadiness: IntegrationReadiness;
  canEditPlatform: boolean;
  canEditClient: boolean;
}

export function SettingsPageContent({
  userRole,
  platformSettings,
  clientSettings,
  clients,
  selectedClientId,
  integrationReadiness,
  canEditPlatform,
  canEditClient,
}: SettingsPageContentProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [platformName, setPlatformName] = useState(
    platformSettings?.platformName ?? "MahaCred QR"
  );
  const [supportEmail, setSupportEmail] = useState(
    platformSettings?.supportEmail ?? "support@mahacred.in"
  );
  const [supportPhone, setSupportPhone] = useState(
    platformSettings?.supportPhone ?? ""
  );

  const [emailNotifications, setEmailNotifications] = useState(
    clientSettings?.emailNotifications ?? true
  );
  const [transactionAlerts, setTransactionAlerts] = useState(
    clientSettings?.transactionAlerts ?? true
  );
  const [weeklyReports, setWeeklyReports] = useState(
    clientSettings?.weeklyReports ?? false
  );

  const handleClientChange = (clientId: string | null) => {
    if (!clientId) return;
    startTransition(() => {
      router.push(`/settings?clientId=${encodeURIComponent(clientId)}`);
    });
  };

  const handleSavePlatform = async () => {
    const result = await updatePlatformSettingsAction({
      platformName,
      supportEmail,
      supportPhone: supportPhone.trim() === "" ? undefined : supportPhone.trim(),
    });

    if (!result.success) {
      toast.error("Unable to save platform settings", {
        description: result.error,
      });
      return;
    }

    toast.success("Platform settings saved");
    startTransition(() => router.refresh());
  };

  const handleSaveClient = async () => {
    const result = await updateClientSettingsAction({
      clientId: selectedClientId ?? undefined,
      emailNotifications,
      transactionAlerts,
      weeklyReports,
    });

    if (!result.success) {
      toast.error("Unable to save client settings", {
        description: result.error,
      });
      return;
    }

    toast.success("Client settings saved");
    startTransition(() => router.refresh());
  };

  const defaultTab = canEditPlatform ? "general" : "client";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Neon-backed application configuration. Settings are not a secret store."
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {canEditPlatform && (
            <TabsTrigger value="general" className="gap-2">
              <Settings className="h-4 w-4" />
              General
            </TabsTrigger>
          )}
          <TabsTrigger value="client" className="gap-2">
            <Building2 className="h-4 w-4" />
            Client Preferences
          </TabsTrigger>
          <TabsTrigger value="integration" className="gap-2">
            <Plug className="h-4 w-4" />
            Integration Readiness
          </TabsTrigger>
        </TabsList>

        {canEditPlatform && (
          <TabsContent value="general" className="mt-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Platform Settings</CardTitle>
                <CardDescription>
                  Super Admin platform configuration persisted in Neon
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="platformName">Platform Name</Label>
                    <Input
                      id="platformName"
                      value={platformName}
                      onChange={(e) => setPlatformName(e.target.value)}
                      disabled={!canEditPlatform || isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail">Support Email</Label>
                    <Input
                      id="supportEmail"
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      disabled={!canEditPlatform || isPending}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportPhone">Support Phone (optional)</Label>
                  <Input
                    id="supportPhone"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    placeholder="10-digit Indian mobile"
                    disabled={!canEditPlatform || isPending}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Default Currency</Label>
                    <Input value="INR (₹)" disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Input value="Asia/Kolkata (IST)" disabled />
                  </div>
                </div>
                <Button
                  onClick={handleSavePlatform}
                  disabled={!canEditPlatform || isPending}
                >
                  {isPending ? "Saving..." : "Save Platform Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="client" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client Preferences</CardTitle>
              <CardDescription>
                Tenant-scoped notification preferences stored in Neon
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canEditPlatform && clients.length > 0 && (
                <div className="space-y-2">
                  <Label>Bank / Patsanstha</Label>
                  <Select
                    value={selectedClientId ?? undefined}
                    onValueChange={handleClientChange}
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!canEditPlatform && userRole === "CLIENT_ADMIN" && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Managing preferences for your authorized client tenant only.
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Email Notifications</p>
                    <p className="text-xs text-muted-foreground">
                      Receive email updates for platform events
                    </p>
                  </div>
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                    disabled={!canEditClient || isPending}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Transaction Alerts</p>
                    <p className="text-xs text-muted-foreground">
                      Alert on high-value or failed transactions
                    </p>
                  </div>
                  <Switch
                    checked={transactionAlerts}
                    onCheckedChange={setTransactionAlerts}
                    disabled={!canEditClient || isPending}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Weekly Reports</p>
                    <p className="text-xs text-muted-foreground">
                      Receive weekly operational summary reports
                    </p>
                  </div>
                  <Switch
                    checked={weeklyReports}
                    onCheckedChange={setWeeklyReports}
                    disabled={!canEditClient || isPending}
                  />
                </div>
              </div>

              <Button
                onClick={handleSaveClient}
                disabled={!canEditClient || isPending || !selectedClientId}
              >
                {isPending ? "Saving..." : "Save Client Preferences"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integration" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SabPaisa Integration Readiness</CardTitle>
              <CardDescription>
                Read-only integration state. Credentials remain server-side environment configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ReadinessRow
                  label="Integration Mode"
                  value={integrationReadiness.integrationMode}
                />
                <ReadinessRow
                  label="Live QR Provider"
                  value={integrationReadiness.liveQrProvider}
                />
                <ReadinessRow
                  label="Live Transaction Provider"
                  value={integrationReadiness.liveTransactionProvider}
                />
                <ReadinessRow
                  label="Public Webhook"
                  value={integrationReadiness.publicWebhook}
                />
                <ReadinessRow
                  label="API Crypto Interoperability"
                  value={integrationReadiness.apiCryptoInteroperability}
                />
                <ReadinessRow
                  label="Webhook Interoperability"
                  value={integrationReadiness.webhookInteroperability}
                />
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  SabPaisa credentials are never stored in application settings.
                </p>
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  API keys, encryption master keys, and HMAC secrets remain in server environment
                  configuration only. Live activation is a controlled future onboarding task.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReadinessRow({ label, value }: { label: string; value: string }) {
  const variant =
    value.toLowerCase().includes("blocked") ||
    value.toLowerCase().includes("disabled") ||
    value.toLowerCase().includes("not enabled")
      ? "secondary"
      : value.toLowerCase().includes("mock")
        ? "outline"
        : "default";

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <span className="text-sm font-medium">{label}</span>
      <Badge variant={variant}>{value}</Badge>
    </div>
  );
}
