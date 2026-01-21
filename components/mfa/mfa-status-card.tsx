"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMfa } from "@/hooks/use-mfa";
import { usePasskeys } from "@/hooks/use-passkeys";
import { TotpSetupDialog } from "./totp-setup-dialog";
import { PasskeySetupDialog } from "./passkey-setup-dialog";
import { BackupCodesDialog } from "./backup-codes-dialog";
import { PasskeyList } from "./passkey-list";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Fingerprint,
  Key,
  Plus,
  RefreshCw,
} from "lucide-react";

export function MfaStatusCard() {
  const {
    isMfaEnabled,
    totpEnabled,
    passkeysEnabled,
    backupCodesRemaining,
    hasBackupCodes,
    loading,
  } = useMfa();
  const { isSupported: passkeysSupported, passkeyCount } = usePasskeys();

  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [showPasskeySetup, setShowPasskeySetup] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [isRegeneratingCodes, setIsRegeneratingCodes] = useState(false);

  const handleRegenerateCodes = () => {
    setIsRegeneratingCodes(true);
    setShowBackupCodes(true);
  };

  const handleBackupCodesClose = () => {
    setShowBackupCodes(false);
    setIsRegeneratingCodes(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isMfaEnabled ? (
                <ShieldCheck className="h-5 w-5 text-green-600" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-amber-500" />
              )}
              <CardTitle>Two-Factor Authentication</CardTitle>
            </div>
            {isMfaEnabled ? (
              <Badge variant="default" className="bg-green-600">
                Enabled
              </Badge>
            ) : (
              <Badge variant="secondary">Disabled</Badge>
            )}
          </div>
          <CardDescription>
            {isMfaEnabled
              ? "Your account is protected with two-factor authentication"
              : "Add an extra layer of security to your account"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Authenticator App Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Authenticator App</p>
                  <p className="text-sm text-muted-foreground">
                    Use Google Authenticator, Authy, or similar
                  </p>
                </div>
              </div>
              {totpEnabled ? (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  Active
                </Badge>
              ) : (
                <Button size="sm" onClick={() => setShowTotpSetup(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Set Up
                </Button>
              )}
            </div>
          </div>

          {/* Passkeys Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Passkeys</p>
                  <p className="text-sm text-muted-foreground">
                    Use biometrics or security keys
                  </p>
                </div>
              </div>
              {passkeyCount > 0 ? (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  {passkeyCount} registered
                </Badge>
              ) : passkeysSupported ? (
                <Button size="sm" onClick={() => setShowPasskeySetup(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              ) : (
                <Badge variant="secondary">Not supported</Badge>
              )}
            </div>

            {passkeyCount > 0 && (
              <div className="pl-13 mt-3">
                <PasskeyList onAddPasskey={() => setShowPasskeySetup(true)} />
                {passkeysSupported && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPasskeySetup(true)}
                    className="mt-3"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Another Passkey
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Backup Codes Section */}
          {isMfaEnabled && (
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Key className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Backup Codes</p>
                    <p className="text-sm text-muted-foreground">
                      {hasBackupCodes
                        ? `${backupCodesRemaining} codes remaining`
                        : "Generate recovery codes"}
                    </p>
                  </div>
                </div>
                {hasBackupCodes ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateCodes}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Regenerate
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setShowBackupCodes(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Generate
                  </Button>
                )}
              </div>

              {hasBackupCodes && backupCodesRemaining <= 3 && (
                <p className="text-sm text-amber-600 pl-13">
                  You have only {backupCodesRemaining} backup code
                  {backupCodesRemaining !== 1 ? "s" : ""} left. Consider
                  regenerating them.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <TotpSetupDialog
        open={showTotpSetup}
        onOpenChange={setShowTotpSetup}
        onSuccess={() => setShowTotpSetup(false)}
      />

      <PasskeySetupDialog
        open={showPasskeySetup}
        onOpenChange={setShowPasskeySetup}
        onSuccess={() => setShowPasskeySetup(false)}
      />

      <BackupCodesDialog
        open={showBackupCodes}
        onOpenChange={handleBackupCodesClose}
        isRegenerate={isRegeneratingCodes}
      />
    </>
  );
}
