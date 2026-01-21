"use client";

import { useState, useEffect } from "react";
import {
  multiFactor,
  TotpMultiFactorGenerator,
  TotpSecret,
} from "firebase/auth";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/components/auth";
import { useMfa } from "@/hooks/use-mfa";
import { BackupCodesList } from "./backup-codes-dialog";
import { Loader2, Copy, Check, AlertCircle, Smartphone } from "lucide-react";

interface TotpSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type SetupStep = "generate" | "verify" | "success";

export function TotpSetupDialog({
  open,
  onOpenChange,
  onSuccess,
}: TotpSetupDialogProps) {
  const { user } = useAuth();
  const { updateTotpStatus, generateBackupCodes, hasBackupCodes } = useMfa();

  const [step, setStep] = useState<SetupStep>("generate");
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep("generate");
      setTotpSecret(null);
      setVerificationCode("");
      setError(null);
      setSecretCopied(false);
      setBackupCodes(null);
      generateSecret();
    }
  }, [open]);

  const generateSecret = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const mfaUser = multiFactor(user);
      const session = await mfaUser.getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      setTotpSecret(secret);
    } catch (err: unknown) {
      console.error("Error generating TOTP secret:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage.includes("invalid-argument") || errorMessage.includes("phoneEnrollmentInfo")) {
        setError(
          "TOTP authentication is not enabled for this project. Please enable it in Firebase Console → Authentication → Sign-in method → Multi-factor authentication."
        );
      } else if (errorMessage.includes("requires-recent-login")) {
        setError("Please sign out and sign back in to enable two-factor authentication.");
      } else {
        setError("Failed to generate authenticator secret. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const copySecret = async () => {
    if (!totpSecret) return;

    try {
      await navigator.clipboard.writeText(totpSecret.secretKey);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = totpSecret.secretKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  };

  const verifyAndEnroll = async () => {
    if (!user || !totpSecret || !verificationCode) return;

    setLoading(true);
    setError(null);

    try {
      const mfaUser = multiFactor(user);
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        verificationCode
      );

      await mfaUser.enroll(assertion, "Authenticator App");

      // Update our MFA settings
      await updateTotpStatus(true, totpSecret.secretKey);

      // Generate backup codes if user doesn't have them yet
      if (!hasBackupCodes) {
        const codes = await generateBackupCodes();
        setBackupCodes(codes);
      }

      setStep("success");
    } catch (err: unknown) {
      console.error("Error enrolling TOTP:", err);
      if (err instanceof Error && err.message.includes("invalid-verification-code")) {
        setError("Invalid code. Please check and try again.");
      } else {
        setError("Failed to set up authenticator. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onOpenChange(false);
    onSuccess?.();
  };

  const qrCodeUrl = totpSecret
    ? totpSecret.generateQrCodeUrl(user?.email || "user", "FiBuKI")
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {step === "success"
              ? "Authenticator Enabled"
              : "Set Up Authenticator App"}
          </DialogTitle>
          <DialogDescription>
            {step === "generate" &&
              "Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)"}
            {step === "verify" && "Enter the 6-digit code from your authenticator app"}
            {step === "success" && "Your account is now protected with two-factor authentication"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === "generate" && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : totpSecret ? (
              <>
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <QRCodeSVG value={qrCodeUrl} size={200} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Or enter this key manually:
                  </Label>
                  <div className="flex gap-2">
                    <code className="flex-1 px-3 py-2 text-sm bg-muted rounded-md font-mono break-all">
                      {totpSecret.secretKey}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copySecret}
                      className="shrink-0"
                    >
                      {secretCopied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {step === "verify" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verification-code">Verification Code</Label>
              <Input
                id="verification-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) =>
                  setVerificationCode(e.target.value.replace(/\D/g, ""))
                }
                className="text-center text-2xl tracking-widest"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit code shown in your authenticator app
              </p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center py-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
            </div>

            {backupCodes && backupCodes.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Save your backup codes!</strong> These codes can be used
                  if you lose access to your authenticator app.
                </AlertDescription>
              </Alert>
            )}

            {backupCodes && <BackupCodesList codes={backupCodes} />}
          </div>
        )}

        <DialogFooter>
          {step === "generate" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("verify")}
                disabled={!totpSecret || loading}
              >
                Continue
              </Button>
            </>
          )}

          {step === "verify" && (
            <>
              <Button variant="outline" onClick={() => setStep("generate")}>
                Back
              </Button>
              <Button
                onClick={verifyAndEnroll}
                disabled={verificationCode.length !== 6 || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Enable"
                )}
              </Button>
            </>
          )}

          {step === "success" && (
            <Button onClick={handleComplete} className="w-full">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
