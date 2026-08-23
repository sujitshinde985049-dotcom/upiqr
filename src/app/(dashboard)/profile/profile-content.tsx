"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeOwnPasswordAction,
  updateOwnProfileAction,
} from "@/lib/actions/user-actions";
import {
  changeOwnPasswordSchema,
  updateOwnProfileSchema,
  type ChangeOwnPasswordInput,
  type UpdateOwnProfileInput,
} from "@/lib/validations/users";
import type { User } from "@/types";

interface ProfilePageContentProps {
  user: User;
}

export function ProfilePageContent({ user }: ProfilePageContentProps) {
  const router = useRouter();
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const profileForm = useForm<UpdateOwnProfileInput>({
    resolver: zodResolver(updateOwnProfileSchema),
    defaultValues: { name: user.name },
  });

  const passwordForm = useForm<ChangeOwnPasswordInput>({
    resolver: zodResolver(changeOwnPasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onProfileSubmit = async (data: UpdateOwnProfileInput) => {
    setProfileSaving(true);
    try {
      const result = await updateOwnProfileAction(data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated successfully");
      router.refresh();
    } finally {
      setProfileSaving(false);
    }
  };

  const onPasswordSubmit = async (data: ChangeOwnPasswordInput) => {
    setPasswordSaving(true);
    try {
      const result = await changeOwnPasswordAction(data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      passwordForm.reset();
      toast.success("Password changed successfully");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Update your account details and password"
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Update your display name. Email is read-only because it is your login identifier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4 max-w-md">
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
              <Input id="email" value={user.email} readOnly disabled />
            </div>
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? "Saving..." : "Save Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Enter your current password and choose a new one. Existing sessions remain active until they expire.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...passwordForm.register("currentPassword")}
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-sm text-destructive">
                  {passwordForm.formState.errors.currentPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...passwordForm.register("newPassword")}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-sm text-destructive">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...passwordForm.register("confirmPassword")}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? "Updating..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
