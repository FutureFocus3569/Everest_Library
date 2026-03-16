import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
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
  currently_reading_book_id: string | null;
  currently_reading_title: string | null;
  confirmed: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

const AdminUsers = () => {
  const { books, readCount, currentlyReadingBookId } = useLibrary();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string>("editor");
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [inviteAccessRole, setInviteAccessRole] = useState<"admin" | "editor">("editor");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState<Record<string, boolean>>({});
  const [isDeletingUser, setIsDeletingUser] = useState<Record<string, boolean>>({});
  const [roleDraftByUserId, setRoleDraftByUserId] = useState<Record<string, string>>({});
  const [manualInviteLink, setManualInviteLink] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let user = session?.user ?? null;

      if (!user) {
        const {
          data: { user: fetchedUser },
        } = await supabase.auth.getUser();
        user = fetchedUser ?? null;
      }

      setCurrentUserId(user?.id ?? null);
      setCurrentEmail(user?.email?.toLowerCase() ?? null);

      if (!user) {
        setCurrentRole("editor");
        setProfileFirstName("");
        setProfileLastName("");
        setProfileAvatarUrl("");
        return;
      }

      const metadataFirstName =
        typeof user.user_metadata?.first_name === "string" ? user.user_metadata.first_name : "";
      const metadataLastName =
        typeof user.user_metadata?.last_name === "string" ? user.user_metadata.last_name : "";
      const metadataAvatarUrl =
        typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : "";

      setProfileFirstName(metadataFirstName);
      setProfileLastName(metadataLastName);
      setProfileAvatarUrl(metadataAvatarUrl);

      let { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, role")
        .eq("id", user.id)
        .single();

      if (profileError && /avatar_url/i.test(profileError.message)) {
        const fallbackProfile = await supabase
          .from("profiles")
          .select("first_name, last_name, role")
          .eq("id", user.id)
          .single();

        profile = fallbackProfile.data
          ? {
              ...fallbackProfile.data,
              avatar_url: null,
            }
          : null;
        profileError = fallbackProfile.error;
      }

      if (!profileError && profile) {
        setCurrentRole(profile.role ?? "editor");
        setProfileFirstName(profile.first_name ?? metadataFirstName);
        setProfileLastName(profile.last_name ?? metadataLastName);
        setProfileAvatarUrl(profile.avatar_url ?? metadataAvatarUrl);
      } else {
        setCurrentRole("editor");
      }
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const isAdmin = (Boolean(adminEmail) && currentEmail === adminEmail) || currentRole === "admin";
  const currentlyReadingCount = currentlyReadingBookId ? 1 : 0;
  const toReadCount = books.filter((book) => Boolean(book.toReadByCurrentUser)).length;

  const loadAccessUsers = async () => {
    setIsLoadingAccess(true);
    setAccessError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setAccessError("Your session expired. Please sign out and log in again.");
        return;
      }

      const { data, error: invokeError } = await supabase.functions.invoke<{ users?: AccessUser[] }>(
        "admin-users",
        {
          method: "GET",
        },
      );

      if (invokeError) {
        setAccessError(invokeError.message || "Could not load users.");
        return;
      }

      const users = data?.users ?? [];
      setAccessUsers(users);
      setRoleDraftByUserId(
        users.reduce<Record<string, string>>((acc, user) => {
          acc[user.id] = user.role;
          return acc;
        }, {}),
      );
    } catch (caughtError) {
      setAccessError(caughtError instanceof Error ? caughtError.message : "Could not load users.");
    } finally {
      setIsLoadingAccess(false);
    }
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
    let successMessage = "Your profile has been updated.";

    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: {
        first_name: profileFirstName.trim() || null,
        last_name: profileLastName.trim() || null,
        avatar_url: profileAvatarUrl.trim() || null,
      },
    });

    if (authUpdateError) {
      successMessage = "Saved in app profile, but could not sync auth profile metadata.";
    }

    let { error: updateError } = await supabase
      .from("profiles")
      .update({
        first_name: profileFirstName.trim() || null,
        last_name: profileLastName.trim() || null,
        avatar_url: profileAvatarUrl.trim() || null,
      })
      .eq("id", currentUserId);

    if (updateError && /avatar_url/i.test(updateError.message)) {
      const fallbackUpdate = await supabase
        .from("profiles")
        .update({
          first_name: profileFirstName.trim() || null,
          last_name: profileLastName.trim() || null,
        })
        .eq("id", currentUserId);

      updateError = fallbackUpdate.error;
      if (!updateError) {
        successMessage = "Name saved. Run profile avatar SQL setup to enable photo saving.";
      }
    }

    if (updateError) {
      setError(updateError.message);
      setIsSavingProfile(false);
      return;
    }

    setMessage(successMessage);
    setIsSavingProfile(false);
    if (isAdmin) {
      await loadAccessUsers();
    }
  };

  const handleProfilePhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    const maxSizeBytes = 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError("Profile photo must be 1MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileAvatarUrl(reader.result);
        setError(null);
        setMessage("Photo selected. Click Save my profile.");
      }
    };
    reader.readAsDataURL(file);
  };

  const openProfilePhotoPicker = () => {
    profilePhotoInputRef.current?.click();
  };

  const submitInvite = async (resend = false, linkOnly = false) => {
    if (resend) {
      setIsResending(true);
    } else if (linkOnly) {
      setIsGeneratingLink(true);
    } else {
      setIsSubmitting(true);
    }
    setMessage(null);
    setError(null);
    setManualInviteLink(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Your session expired. Please sign out and log in again.");
        return;
      }

      const { data: payload, error: invokeError } = await supabase.functions.invoke<{
        message?: string;
        actionLink?: string;
      }>("invite-user", {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          desiredRole: inviteAccessRole,
          resend,
          linkOnly,
        },
      });

      if (invokeError) {
        setError(invokeError.message || "Invite failed.");
        return;
      }

      setMessage(payload?.message ?? `Invite sent to ${inviteEmail.trim().toLowerCase()}.`);
      setManualInviteLink(payload?.actionLink ?? null);
      setInviteEmail("");
      if (!resend) {
        setFirstName("");
        setLastName("");
        setInviteAccessRole("editor");
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Invite failed.");
    } finally {
      setIsSubmitting(false);
      setIsResending(false);
      setIsGeneratingLink(false);
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitInvite(false);
  };

  const handleResend = async () => {
    await submitInvite(true);
  };

  const handleGenerateLink = async () => {
    await submitInvite(true, true);
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

      const { data: payload, error: invokeError } = await supabase.functions.invoke<{ message?: string }>(
        "delete-user",
        {
          body: { userId: user.id, email: user.email },
        },
      );

      if (invokeError) {
        setError(invokeError.message || "Delete failed.");
        return;
      }

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
          {import.meta.env.DEV ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Signed in as: {currentEmail ?? "(not signed in)"} · Admin check: {isAdmin ? "true" : "false"} · Expected admin email: {adminEmail || "(not set)"}
            </p>
          ) : null}
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
              <div className="space-y-2">
                <Label>Profile photo</Label>
                <div className="flex flex-col items-center gap-2">
                  <input
                    ref={profilePhotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePhotoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={openProfilePhotoPicker}
                    className="relative h-24 w-24 overflow-hidden rounded-full border border-border bg-muted transition hover:opacity-90"
                  >
                    {profileAvatarUrl ? (
                      <img src={profileAvatarUrl} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        Add photo
                      </div>
                    )}
                  </button>
                  <p className="text-xs text-muted-foreground">Tap photo to change</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input id="profile-email" value={currentEmail ?? ""} readOnly />
                </div>
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
                {isSavingProfile ? "Saving..." : "Save my profile"}
              </Button>

              <p className="text-sm text-muted-foreground">
                Books read: <span className="font-semibold text-foreground">{readCount}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Currently reading: <span className="font-semibold text-foreground">{currentlyReadingCount}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                To read: <span className="font-semibold text-foreground">{toReadCount}</span>
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

              <div className="space-y-2">
                <Label htmlFor="invite-role">Access level</Label>
                <Select
                  value={inviteAccessRole}
                  onValueChange={(value: "admin" | "editor") => setInviteAccessRole(value)}
                >
                  <SelectTrigger id="invite-role" className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Select access" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">User access</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
              {manualInviteLink ? (
                <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Manual invite link (share this directly with the user):
                  </p>
                  <a
                    href={manualInviteLink}
                    target="_blank"
                    rel="noreferrer"
                    className="block break-all text-xs text-primary underline"
                  >
                    {manualInviteLink}
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(manualInviteLink);
                      setMessage("Manual invite link copied.");
                    }}
                  >
                    Copy link
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSubmitting || isResending}>
                  {isSubmitting ? "Sending invite..." : "Send invite"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResend}
                  disabled={isSubmitting || isResending || isGeneratingLink || !inviteEmail.trim()}
                >
                  {isResending ? "Resending..." : "Resend invite"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateLink}
                  disabled={isSubmitting || isResending || isGeneratingLink || !inviteEmail.trim()}
                >
                  {isGeneratingLink ? "Generating..." : "Generate setup link"}
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
                    <TableHead>Currently Reading</TableHead>
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
                      <TableCell>{user.currently_reading_title ?? "-"}</TableCell>
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
                      <TableCell colSpan={6} className="text-muted-foreground">
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