import { FormEvent, useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLibrary } from "@/context/LibraryContext";

const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL ?? "").toLowerCase();

type AccessUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  confirmed: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

const AdminUsers = () => {
  const { readCount } = useLibrary();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState<Record<string, boolean>>({});
  const [isDeletingUser, setIsDeletingUser] = useState<Record<string, boolean>>({});
  const [roleDraftByUserId, setRoleDraftByUserId] = useState<Record<string, string>>({});
  const [accessError, setAccessError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? null);
      setCurrentEmail(user?.email?.toLowerCase() ?? null);

      if (!user?.id) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();

      setProfileFirstName(profile?.first_name ?? "");
      setProfileLastName(profile?.last_name ?? "");
    };

    loadUser();
  }, []);

  const isAdmin = Boolean(adminEmail) && currentEmail === adminEmail;

  const loadAccessUsers = async () => {
    setIsLoadingAccess(true);
    setAccessError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setAccessError("Your session expired. Please sign out and log in again.");
      setIsLoadingAccess(false);
      return;
    }

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`;
    const response = await fetch(functionUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const rawText = await response.text().catch(() => "");
      let detailedError = `Could not load users (${response.status})`;
      if (rawText) {
        try {
          const payload = JSON.parse(rawText) as { error?: string };
          if (payload?.error) detailedError = payload.error;
        } catch {
          detailedError = `${detailedError}: ${rawText}`;
        }
      }
      setAccessError(detailedError);
      setIsLoadingAccess(false);
      return;
    }

    const payload = (await response.json()) as { users?: AccessUser[] };
    const users = payload.users ?? [];
    setAccessUsers(users);
    setRoleDraftByUserId(
      users.reduce<Record<string, string>>((acc, user) => {
        acc[user.id] = user.role;
        return acc;
      }, {}),
    );
    setIsLoadingAccess(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadAccessUsers();
  }, [isAdmin]);

  const saveMyProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUserId) {
      setError("No active user session.");
      return;
    }

    setIsSavingProfile(true);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        first_name: profileFirstName.trim() || null,
        last_name: profileLastName.trim() || null,
      })
      .eq("id", currentUserId);

    if (updateError) {
      setError(updateError.message);
      setIsSavingProfile(false);
      return;
    }

    setMessage("Your profile name has been updated.");
    setIsSavingProfile(false);
    if (isAdmin) {
      await loadAccessUsers();
    }
  };

  const submitInvite = async (resend = false) => {
    if (resend) {
      setIsResending(true);
    } else {
      setIsSubmitting(true);
    }
    setMessage(null);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("Your session expired. Please sign out and log in again.");
      setIsSubmitting(false);
      setIsResending(false);
      return;
    }

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`;

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: inviteEmail.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        resend,
      }),
    });

    if (!response.ok) {
      const rawText = await response.text().catch(() => "");
      let detailedError = `Invite failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})`;

      if (rawText) {
        try {
          const payload = JSON.parse(rawText) as { error?: string };
          if (payload?.error) {
            detailedError = payload.error;
          }
        } catch {
          detailedError = `${detailedError}: ${rawText}`;
        }
      }

      setError(detailedError);
      setIsSubmitting(false);
      setIsResending(false);
      return;
    }

    const payload = await response.json().catch(() => null);
    setMessage(payload?.message ?? `Invite sent to ${inviteEmail.trim().toLowerCase()}.`);
    setInviteEmail("");
    if (!resend) {
      setFirstName("");
      setLastName("");
    }
    setIsSubmitting(false);
    setIsResending(false);
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitInvite(false);
  };

  const handleResend = async () => {
    await submitInvite(true);
  };

  const updateRole = async (userId: string) => {
    const nextRole = roleDraftByUserId[userId];
    if (!nextRole) return;

    setError(null);
    setMessage(null);
    setIsSavingRole((prev) => ({ ...prev, [userId]: true }));

    try {
      const { error: rpcError } = await supabase.rpc("admin_update_user_role", {
        target_user_id: userId,
        new_role: nextRole,
      });

      if (rpcError) {
        setError(rpcError.message || "Could not update role.");
        return;
      }

      setMessage("Role updated.");
      setAccessUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, role: nextRole } : user)));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not update role.");
    } finally {
      setIsSavingRole((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const deleteAccessUser = async (user: AccessUser) => {
    if (!user.id) return;
    if (user.id === currentUserId) {
      setError("You cannot delete your own account.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${user.email ?? "this user"}? They will lose access now, and you can invite them again later.`
    );

    if (!confirmed) return;

    setError(null);
    setMessage(null);
    setIsDeletingUser((prev) => ({ ...prev, [user.id]: true }));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Your session expired. Please sign out and log in again.");
        return;
      }

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      });

      if (!response.ok) {
        const rawText = await response.text().catch(() => "");
        let detailedError = `Delete failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})`;

        if (rawText) {
          try {
            const payload = JSON.parse(rawText) as { error?: string };
            if (payload?.error) {
              detailedError = payload.error;
            }
          } catch {
            detailedError = `${detailedError}: ${rawText}`;
          }
        }

        setError(detailedError);
        return;
      }

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(payload?.message ?? "User deleted. You can invite them again later.");
      setAccessUsers((prev) => prev.filter((accessUser) => accessUser.id !== user.id));
      setRoleDraftByUserId((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not delete user.");
    } finally {
      setIsDeletingUser((prev) => ({ ...prev, [user.id]: false }));
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold text-foreground">
            {isAdmin ? "Admin users" : "My profile"}
          </h1>
          <p className="mt-1 font-body text-muted-foreground">
            {isAdmin
              ? "Invite a new user to access Everest Library."
              : "Manage your profile details and reading progress."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>My profile</CardTitle>
            <CardDescription>
              Save your first and last name used for notes and activity labels.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveMyProfile} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-first-name">First name</Label>
                  <Input
                    id="profile-first-name"
                    value={profileFirstName}
                    onChange={(event) => setProfileFirstName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-last-name">Last name</Label>
                  <Input
                    id="profile-last-name"
                    value={profileLastName}
                    onChange={(event) => setProfileLastName(event.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? "Saving..." : "Save my name"}
              </Button>

              <p className="text-sm text-muted-foreground">
                Books read: <span className="font-semibold text-foreground">{readCount}</span>
              </p>
            </form>
          </CardContent>
        </Card>

        {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite user</CardTitle>
            <CardDescription>
              Sends an email invitation using your secure backend function.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">User email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first-name">First name</Label>
                  <Input
                    id="first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Last name</Label>
                  <Input
                    id="last-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                  />
                </div>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSubmitting || isResending}>
                  {isSubmitting ? "Sending invite..." : "Send invite"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResend}
                  disabled={isSubmitting || isResending || !inviteEmail.trim()}
                >
                  {isResending ? "Resending..." : "Resend invite"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        ) : null}

        {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>User access</CardTitle>
            <CardDescription>
              Master view of who has access to the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={loadAccessUsers} disabled={isLoadingAccess}>
                {isLoadingAccess ? "Refreshing..." : "Refresh list"}
              </Button>
            </div>

            {accessError ? <p className="text-sm text-destructive">{accessError}</p> : null}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.email ?? "-"}</TableCell>
                      <TableCell>{[user.first_name, user.last_name].filter(Boolean).join(" ") || "-"}</TableCell>
                      <TableCell>{user.confirmed ? "Confirmed" : "Invited"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={roleDraftByUserId[user.id] ?? user.role}
                            onValueChange={(value) =>
                              setRoleDraftByUserId((prev) => ({
                                ...prev,
                                [user.id]: value,
                              }))
                            }
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateRole(user.id)}
                            disabled={isSavingRole[user.id] || (roleDraftByUserId[user.id] ?? user.role) === user.role}
                          >
                            {isSavingRole[user.id] ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteAccessUser(user)}
                          disabled={isDeletingUser[user.id] || user.id === currentUserId}
                        >
                          {isDeletingUser[user.id] ? "Deleting..." : "Delete"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoadingAccess && accessUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        ) : null}
      </div>
    </AppLayout>
  );
};

export default AdminUsers;