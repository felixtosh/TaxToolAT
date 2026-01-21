"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMfaChallenge, MfaChallengeMethod } from "@/hooks/use-mfa-challenge";
import {
  Loader2,
  AlertCircle,
  Smartphone,
  Fingerprint,
  Key,
} from "lucide-react";

interface MfaChallengeDialogProps {
  open: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export function MfaChallengeDialog({
  open,
  onSuccess,
  onCancel,
}: MfaChallengeDialogProps) {
  const {
    availableMethods,
    selectedMethod,
    loading,
    error,
    selectMethod,
    verifyTotp,
    verifyPasskey,
    verifyBackupCode,
    clearChallenge,
  } = useMfaChallenge();

  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verifyTotp(totpCode);
      onSuccess();
    } catch {
      // Error is handled by the hook
    }
  };

  const handlePasskeyVerify = async () => {
    try {
      await verifyPasskey();
      onSuccess();
    } catch {
      // Error is handled by the hook
    }
  };

  const handleBackupCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verifyBackupCode(backupCode);
      onSuccess();
    } catch {
      // Error is handled by the hook
    }
  };

  const handleCancel = () => {
    clearChallenge();
    setTotpCode("");
    setBackupCode("");
    onCancel();
  };

  const getMethodIcon = (method: MfaChallengeMethod) => {
    switch (method) {
      case "totp":
        return <Smartphone className="h-4 w-4" />;
      case "passkey":
        return <Fingerprint className="h-4 w-4" />;
      case "backup_code":
        return <Key className="h-4 w-4" />;
    }
  };

  const getMethodLabel = (method: MfaChallengeMethod) => {
    switch (method) {
      case "totp":
        return "Authenticator";
      case "passkey":
        return "Passkey";
      case "backup_code":
        return "Backup Code";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            Verify your identity to continue signing in
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {availableMethods.length > 1 ? (
          <Tabs
            value={selectedMethod || availableMethods[0]}
            onValueChange={(v) => selectMethod(v as MfaChallengeMethod)}
          >
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${availableMethods.length}, 1fr)` }}>
              {availableMethods.map((method) => (
                <TabsTrigger
                  key={method}
                  value={method}
                  className="flex items-center gap-2"
                >
                  {getMethodIcon(method)}
                  <span className="hidden sm:inline">{getMethodLabel(method)}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="totp" className="space-y-4 mt-4">
              <form onSubmit={handleTotpSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="totp-code">Verification Code</Label>
                  <Input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) =>
                      setTotpCode(e.target.value.replace(/\D/g, ""))
                    }
                    className="text-center text-2xl tracking-widest"
                    autoFocus
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    className="flex-1"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={totpCode.length !== 6 || loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Verify"
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="passkey" className="space-y-4 mt-4">
              <div className="text-center py-4">
                <Fingerprint className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  Use your passkey to verify your identity
                </p>
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handlePasskeyVerify} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Use Passkey"
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="backup_code" className="space-y-4 mt-4">
              <form onSubmit={handleBackupCodeSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="backup-code">Backup Code</Label>
                  <Input
                    id="backup-code"
                    type="text"
                    placeholder="XXXX-XXXX"
                    value={backupCode}
                    onChange={(e) =>
                      setBackupCode(e.target.value.toUpperCase())
                    }
                    className="text-center text-lg tracking-widest font-mono"
                    autoFocus
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter one of your backup codes. Each code can only be used
                    once.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    className="flex-1"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={backupCode.length < 8 || loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Verify"
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        ) : selectedMethod === "totp" ? (
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="totp-code-single">Verification Code</Label>
              <Input
                id="totp-code-single"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-2xl tracking-widest"
                autoFocus
                disabled={loading}
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                className="flex-1"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={totpCode.length !== 6 || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Verify"
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground">No verification method available</p>
            <Button variant="outline" onClick={handleCancel} className="mt-4">
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
