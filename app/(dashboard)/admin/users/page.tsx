"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Shield,
  ShieldOff,
  Loader2,
  UserPlus,
  Users,
  Mail,
  CheckCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ProtectedRoute, useAuth } from "@/components/auth";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/lib/firebase/config";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
} from "firebase/firestore";
import { addAllowedEmail, removeAllowedEmail } from "@/lib/operations";
import { AllowedEmail } from "@/types/auth";
import { formatDistanceToNow } from "date-fns";

interface Admin {
  uid: string;
  email: string;
  displayName?: string;
  isSuperAdmin: boolean;
}

export default function AdminUsersPage() {
  const { userId, isAdmin } = useAuth();
  const [invites, setInvites] = useState<AllowedEmail[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [togglingAdmin, setTogglingAdmin] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load invites from Firestore
  useEffect(() => {
    const invitesRef = collection(db, "allowedEmails");
    const q = query(invitesRef, orderBy("addedAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as AllowedEmail[];
      setInvites(data);
      setLoadingInvites(false);
    });

    return () => unsubscribe();
  }, []);

  // Load admins from Cloud Function
  const loadAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    try {
      const listAdminsFn = httpsCallable<void, { admins: Admin[] }>(
        functions,
        "listAdmins"
      );
      const result = await listAdminsFn();
      setAdmins(result.data.admins);
    } catch (err) {
      console.error("Error loading admins:", err);
    } finally {
      setLoadingAdmins(false);
    }
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const handleInvite = async () => {
    if (!newEmail.trim() || !userId) return;

    setError("");
    setSuccess("");
    setInviting(true);

    try {
      await addAllowedEmail({ db, userId }, newEmail.trim());
      setNewEmail("");
      setSuccess(`Invitation sent to ${newEmail.trim()}`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveInvite = async (invite: AllowedEmail) => {
    if (!userId) return;

    setRemoving(invite.id);
    try {
      await removeAllowedEmail({ db, userId }, invite.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove invite");
    } finally {
      setRemoving(null);
    }
  };

  const handleToggleAdmin = async (admin: Admin) => {
    if (admin.isSuperAdmin) return; // Can't modify super admin

    setTogglingAdmin(admin.uid);
    try {
      const setAdminClaimFn = httpsCallable(functions, "setAdminClaim");
      await setAdminClaimFn({
        targetUid: admin.uid,
        isAdmin: false, // Remove admin status
      });
      await loadAdmins(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update admin status");
    } finally {
      setTogglingAdmin(null);
    }
  };

  const handleMakeAdmin = async (email: string, uid?: string) => {
    if (!uid) return;

    setTogglingAdmin(uid);
    try {
      const setAdminClaimFn = httpsCallable(functions, "setAdminClaim");
      await setAdminClaimFn({
        targetUid: uid,
        isAdmin: true,
      });
      await loadAdmins();
      setSuccess(`${email} is now an admin`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set admin status");
    } finally {
      setTogglingAdmin(null);
    }
  };

  return (
    <ProtectedRoute requireAdmin>
      <div className="h-full overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-semibold">User Management</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Invite users and manage admin permissions
            </p>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Invite Users Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Invite Users
              </CardTitle>
              <CardDescription>
                Add email addresses to allow new users to register
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Invite Form */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  />
                </div>
                <Button onClick={handleInvite} disabled={inviting || !newEmail.trim()}>
                  {inviting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Invite
                    </>
                  )}
                </Button>
              </div>

              {/* Invites List */}
              {loadingInvites ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : invites.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Mail className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No pending invites</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Invited{" "}
                            {formatDistanceToNow(invite.addedAt.toDate(), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {invite.usedAt ? (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Registered
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                        {!invite.usedAt && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                disabled={removing === invite.id}
                              >
                                {removing === invite.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Invite?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will prevent {invite.email} from registering.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveInvite(invite)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manage Admins Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Administrators
              </CardTitle>
              <CardDescription>
                Users with admin privileges can invite others and manage settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAdmins ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : admins.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No admins found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <div
                      key={admin.uid}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Shield className="h-4 w-4 text-primary" />
                        <div>
                          <p className="font-medium">
                            {admin.displayName || admin.email}
                          </p>
                          {admin.displayName && (
                            <p className="text-xs text-muted-foreground">
                              {admin.email}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {admin.isSuperAdmin ? (
                          <Badge>Super Admin</Badge>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={togglingAdmin === admin.uid}
                              >
                                {togglingAdmin === admin.uid ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <ShieldOff className="h-4 w-4 mr-1" />
                                    Remove Admin
                                  </>
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Admin?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {admin.email} will no longer be able to manage users
                                  or access admin settings.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleToggleAdmin(admin)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Remove Admin
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info */}
          <div className="text-sm text-muted-foreground">
            <p>
              <strong>Super Admin:</strong> felix@i7v6.com has permanent admin access
              and cannot be removed.
            </p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
