"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  adminResetUserPasswordAction,
  updateUserProfileAction,
} from "@/lib/actions/user-actions";
import {
  adminResetPasswordSchema,
  updateUserProfileSchema,
  type AdminResetPasswordInput,
  type UpdateUserProfileInput,
} from "@/lib/validations/users";
import type { User, UserRole } from "@/types";

const roleLabels: Record<UserRole, string> = {
  super_admin: "Super Admin",
  client_admin: "Client Admin",
  client_operator: "Client Operator",
  merchant_user: "Merchant User",
};

interface UserEditPageContentProps {
  user: User;
}

export function UserEditPageContent({ user }: UserEditPageContentProps) {
  const router = useRouter();
  const [profileSaving, setProfileSaving] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);

  const profileForm = useForm<UpdateUserProfileInput>({
    resolver: zodResolver(updateUserProfileSchema),
    defaultValues: {
      userId: user.id,
      name: user.name,
      email: user.email,
    },
  });

  const resetForm = useForm<AdminResetPasswordInput>({
    resolver: zodResolver(adminResetPasswordSchema),
    defaultValues: {
      userId: user.id,
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onProfileSubmit = async (data: UpdateUserProfileInput) => {
    setProfileSaving(true);
    try {
      const result = await updateUserProfileAction(data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("User profile updated successfully");
      router.refresh();
    } finally {
      setProfileSaving(false);
    }
  };

  const onResetSubmit = async (data: AdminResetPasswordInput) => {
    setResetSaving(true);
    try {
      const result = await adminResetUserPasswordAction(data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      resetForm.reset({ userId: user.id, newPassword: "", confirmPassword: "" });
      toast.success("Temporary password set successfully. Share it securely with the user.");
    } finally {
      setResetSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit User"
        description="Update profile details or reset the user's temporary password"
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
        <CardHeader>
          <CardTitle>Account Context</CardTitle>
          <CardDescription>Role and tenant relationships cannot be changed here.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <div>
            <Label>Role</Label>
            <div className="mt-2">
              <Badge variant="outline">{roleLabels[user.role]}</Badge>
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <div className="mt-2">
              <StatusBadge status={user.status} />
            </div>
          </div>
          <div>
            <Label>Client ID</Label>
            <p className="mt-2 text-sm text-muted-foreground">{user.clientId ?? "—"}</p>
          </div>
          <div>
            <Label>Merchant ID</Label>
            <p className="mt-2 text-sm text-muted-foreground">{user.merchantId ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4 max-w-md">
            <input type="hidden" {...profileForm.register("userId")} />
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...profileForm.register("name")} />
              {profileForm.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {profileForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...profileForm.register("email")} />
              {profileForm.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {profileForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? "Saving..." : "Save Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>
            Set a new temporary password for this user. The password is hashed immediately and is not stored in plaintext.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4 max-w-md">
            <input type="hidden" {...resetForm.register("userId")} />
            <div className="space-y-2">
              <Label htmlFor="newPassword">Temporary Password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...resetForm.register("newPassword")}
              />
              {resetForm.formState.errors.newPassword && (
                <p className="text-sm text-destructive">
                  {resetForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Temporary Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...resetForm.register("confirmPassword")}
              />
              {resetForm.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {resetForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
            <Button type="submit" variant="secondary" disabled={resetSaving}>
              {resetSaving ? "Resetting..." : "Reset Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
