"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Settings,
  Shield,
  Bell,
  Plug,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function StatusIndicator({
  status,
  label,
}: {
  status: "configured" | "not_configured" | "pending";
  label: string;
}) {
  const config = {
    configured: {
      icon: CheckCircle2,
      color: "text-emerald-600",
      badge: "Configured",
      variant: "default" as const,
    },
    not_configured: {
      icon: XCircle,
      color: "text-muted-foreground",
      badge: "Not Configured",
      variant: "secondary" as const,
    },
    pending: {
      icon: Clock,
      color: "text-amber-600",
      badge: "Pending",
      variant: "outline" as const,
    },
  }[status];

  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${config.color}`} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Badge variant={config.variant}>{config.badge}</Badge>
    </div>
  );
}

export function SettingsPageContent() {
  const [platformName, setPlatformName] = useState("MahaCred QR");
  const [supportEmail, setSupportEmail] = useState("support@mahacred.in");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [transactionAlerts, setTransactionAlerts] = useState(true);
  const [weeklyReports, setWeeklyReports] = useState(false);

  const handleSave = (section: string) => {
    toast.success(`${section} saved`, {
      description: "Platform preferences are not persisted yet in Phase 2.",
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Platform configuration and integration settings"
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="sabpaisa" className="gap-2">
            <Plug className="h-4 w-4" />
            SabPaisa Integration
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General Settings</CardTitle>
              <CardDescription>
                Basic platform configuration for MahaCred QR
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Default Currency</Label>
                <Input value="INR (₹)" disabled />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input value="Asia/Kolkata (IST)" disabled />
              </div>
              <Button onClick={() => handleSave("General settings")}>
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security Settings</CardTitle>
              <CardDescription>
                Authentication and access control (Phase 2)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatusIndicator status="configured" label="PostgreSQL Database" />
                <StatusIndicator status="configured" label="Authentication (Auth.js)" />
                <StatusIndicator status="configured" label="Password Hashing (bcrypt)" />
                <StatusIndicator status="configured" label="RBAC & Tenant Isolation" />
                <StatusIndicator status="configured" label="Audit Logging Foundation" />
                <StatusIndicator status="not_configured" label="Two-Factor Authentication" />
              </div>
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Phase 2 provides database-backed authentication with JWT sessions,
                role-based access control, and server-side tenant isolation. Passwords
                are hashed with bcrypt and never stored in plaintext.
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground">
                      Require 2FA for admin users
                    </p>
                  </div>
                  <Switch disabled />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Session Timeout</p>
                    <p className="text-xs text-muted-foreground">
                      Auto logout after inactivity
                    </p>
                  </div>
                  <Input className="w-24" value="30 min" disabled />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Password Policy</p>
                    <p className="text-xs text-muted-foreground">
                      Minimum length and complexity rules
                    </p>
                  </div>
                  <Badge variant="outline">Phase 2</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sabpaisa" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SabPaisa Integration</CardTitle>
              <CardDescription>
                Payment gateway configuration status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Environment</span>
                  <Badge variant="outline">Not Connected</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sandbox / Production selection will be available in Phase 4
                </p>
              </div>

              <div className="space-y-3">
                <StatusIndicator
                  status="not_configured"
                  label="API Configuration Status"
                />
                <StatusIndicator
                  status="not_configured"
                  label="Encryption Configuration Status"
                />
                <StatusIndicator status="not_configured" label="Connection Status" />
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  SabPaisa credentials will be configured securely on the server
                  during Phase 4.
                </p>
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  API keys, encryption master keys, and HMAC secrets are never
                  stored in frontend code. All SabPaisa communication will flow
                  through the MahaCred backend.
                </p>
              </div>

              <div className="text-xs text-muted-foreground">
                <p className="font-medium">Architecture:</p>
                <p className="mt-1 font-mono">
                  Browser → MahaCred Backend → SabPaisa
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
              <CardDescription>
                Configure email and alert notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Weekly Reports</p>
                    <p className="text-xs text-muted-foreground">
                      Receive weekly collection summary reports
                    </p>
                  </div>
                  <Switch
                    checked={weeklyReports}
                    onCheckedChange={setWeeklyReports}
                  />
                </div>
              </div>
              <Button onClick={() => handleSave("Notification preferences")}>
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
