"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { QrCode, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { resolveSafePostLoginRedirect } from "@/lib/auth/safe-redirect";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.ok) {
      toast.success("Welcome back!");
      const destination = resolveSafePostLoginRedirect(
        searchParams.get("callbackUrl")
      );
      router.push(destination);
      router.refresh();
    } else {
      toast.error("Invalid credentials", {
        description: "Please check your email and password.",
      });
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
            <QrCode className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">MahaCred QR</h1>
            <p className="text-sm text-primary-foreground/70">
              Multi-Tenant Merchant Payment Platform
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-bold leading-tight">
            Manage QR Payments Across Banks &amp; Patsansthas
          </h2>
          <p className="text-primary-foreground/80 max-w-md">
            A unified platform for financial institutions to onboard merchants,
            generate QR codes, and track UPI transactions — built for the
            Indian banking ecosystem.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/50">
          Secure access for authorized financial institution users.
        </p>
      </div>

      <div className="flex w-full flex-col items-center justify-center p-6 lg:w-1/2">
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <QrCode className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold">MahaCred QR</h1>
            <p className="text-xs text-muted-foreground">
              Multi-Tenant Merchant Payment Platform
            </p>
          </div>
        </div>

        <Card className="w-full max-w-md border-border/60 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the admin portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email / Username</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@institution.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(v === true)}
                  />
                  <Label htmlFor="remember" className="text-sm font-normal">
                    Remember Me
                  </Label>
                </div>
                <Link
                  href="#"
                  className="text-sm text-primary hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    toast.info("Password reset will be available in a future phase");
                  }}
                >
                  Forgot Password?
                </Link>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Login"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
