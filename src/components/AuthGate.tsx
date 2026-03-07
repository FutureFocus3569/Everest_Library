import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase, hasSupabaseEnv } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mountain } from "lucide-react";

const getAuthTypeFromUrl = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash?.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  const hashParams = new URLSearchParams(hash ?? "");
  const searchParams = new URLSearchParams(window.location.search);

  return hashParams.get("type") ?? searchParams.get("type");
};

const hasPasswordSetupFlag = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("setup") === "password";
};

const AuthScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showLogoImage, setShowLogoImage] = useState(true);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
    }

    setIsSubmitting(false);
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email first, then tap Forgot password.");
      return;
    }

    setIsSendingReset(true);

    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    if (resetError) {
      setError(resetError.message);
      setIsSendingReset(false);
      return;
    }

    setInfo("Password reset email sent. Check your inbox and spam folder.");
    setIsSendingReset(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 px-6 pt-6">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-primary">
            {showLogoImage ? (
              <img
                src="/logo.png"
                alt="Everest Library logo"
                className="h-full w-full object-cover"
                onError={() => setShowLogoImage(false)}
              />
            ) : (
              <Mountain className="h-5 w-5 text-primary-foreground" />
            )}
          </div>
          <span className="font-display text-2xl font-bold tracking-tight text-foreground">
            Everest Library
          </span>
        </div>
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>
            Use your email and password to access your library.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                className="h-auto px-0 text-sm"
                onClick={handleForgotPassword}
                disabled={isSendingReset}
              >
                {isSendingReset ? "Sending..." : "Forgot password?"}
              </Button>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : "Log in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const PasswordSetupScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }

    onComplete();
    if (typeof window !== "undefined") {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your password</CardTitle>
          <CardDescription>
            Set a password for your account so you can log in anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordSetupMode, setIsPasswordSetupMode] = useState(false);

  useEffect(() => {
    if (!hasSupabaseEnv) {
      setIsLoading(false);
      return;
    }

    const fetchSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      const authType = getAuthTypeFromUrl();
      if (authType === "recovery" || authType === "invite" || hasPasswordSetupFlag()) {
        setIsPasswordSetupMode(true);
      }
      setIsLoading(false);
    };

    fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordSetupMode(true);
      }

      const authType = getAuthTypeFromUrl();
      if (authType === "invite" || hasPasswordSetupFlag()) {
        setIsPasswordSetupMode(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!hasSupabaseEnv) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          Missing Supabase environment variables. Add VITE_SUPABASE_URL and
          VITE_SUPABASE_ANON_KEY in .env.local.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (isPasswordSetupMode) {
    return <PasswordSetupScreen onComplete={() => setIsPasswordSetupMode(false)} />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  return <>{children}</>;
};
