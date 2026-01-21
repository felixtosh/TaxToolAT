"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePasskeys } from "@/hooks/use-passkeys";
import { PasskeyCredential } from "@/types/mfa";
import { Fingerprint, Key, Smartphone, Trash2, Loader2 } from "lucide-react";
import { Timestamp } from "firebase/firestore";

interface PasskeyListProps {
  onAddPasskey?: () => void;
}

export function PasskeyList({ onAddPasskey }: PasskeyListProps) {
  const { passkeys, loading, deletePasskey, actionLoading } = usePasskeys();
  const [deleteTarget, setDeleteTarget] = useState<PasskeyCredential | null>(null);

  const getPasskeyIcon = (passkey: PasskeyCredential) => {
    const transports = passkey.transports || [];

    // Internal means platform authenticator (Touch ID, Face ID, Windows Hello)
    if (transports.includes("internal")) {
      return <Fingerprint className="h-5 w-5" />;
    }

    // USB or NFC typically means security key
    if (transports.includes("usb") || transports.includes("nfc")) {
      return <Key className="h-5 w-5" />;
    }

    // Hybrid means cross-device (phone)
    if (transports.includes("hybrid")) {
      return <Smartphone className="h-5 w-5" />;
    }

    // Default
    return <Key className="h-5 w-5" />;
  };

  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return "Never";
    const date = timestamp.toDate();
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deletePasskey(deleteTarget.id);
    } catch (error) {
      console.error("Failed to delete passkey:", error);
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {passkeys.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Fingerprint className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No passkeys registered</p>
          <p className="text-sm mt-1">
            Add a passkey to sign in with biometrics or a security key
          </p>
          {onAddPasskey && (
            <Button onClick={onAddPasskey} className="mt-4">
              Add Passkey
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {passkeys.map((passkey) => (
            <div
              key={passkey.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  {getPasskeyIcon(passkey)}
                </div>
                <div>
                  <p className="font-medium">{passkey.deviceName}</p>
                  <p className="text-sm text-muted-foreground">
                    Added {formatDate(passkey.createdAt)}
                    {passkey.lastUsedAt && (
                      <> &middot; Last used {formatDate(passkey.lastUsedAt)}</>
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteTarget(passkey)}
                disabled={actionLoading}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Passkey</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &ldquo;{deleteTarget?.deviceName}
              &rdquo;? You won&apos;t be able to use this passkey to sign in
              anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
