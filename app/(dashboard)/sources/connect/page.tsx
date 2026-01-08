"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, ExternalLink, Loader2, CheckCircle } from "lucide-react";
import { BankSelector } from "@/components/sources/bank-selector";
import { useBankConnection } from "@/hooks/use-bank-connection";

function ConnectBankContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectionId = searchParams.get("connectionId");
  const sourceId = searchParams.get("sourceId"); // Existing source to link

  const {
    state,
    isLoading,
    selectCountry,
    goBackToCountry,
    startConnection,
    checkStatus,
    reset,
    clearError,
  } = useBankConnection(sourceId);

  // If we have a connectionId in URL (returning from bank), check status
  useEffect(() => {
    if (connectionId && state.step === "select-country") {
      // User returned from bank authorization
      checkStatus(connectionId);
    }
  }, [connectionId, state.step, checkStatus]);

  // Handle complete state
  useEffect(() => {
    if (state.step === "complete" && state.createdSourceId) {
      // Redirect to source page after short delay
      const timeout = setTimeout(() => {
        router.push(`/sources`);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [state.step, state.createdSourceId, router]);

  const handleBack = () => {
    router.push("/sources");
  };

  // Error state
  if (state.step === "error") {
    return (
      <div className="container max-w-lg mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Connection Failed</CardTitle>
            <CardDescription>{state.error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full" onClick={clearError}>
              Try Again
            </Button>
            <Button variant="ghost" className="w-full" onClick={handleBack}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authorizing state (waiting for user to complete bank auth)
  if (state.step === "authorizing") {
    return (
      <div className="container max-w-lg mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Complete Authorization</CardTitle>
            <CardDescription>
              Please complete the authorization in the bank window that opened.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for bank authorization...
              </AlertDescription>
            </Alert>

            {state.authorizationUrl && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(state.authorizationUrl!, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Bank Authorization
              </Button>
            )}

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                if (state.connectionId) {
                  checkStatus(state.connectionId);
                }
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                "I've completed authorization"
              )}
            </Button>

            <Button variant="ghost" className="w-full text-muted-foreground" onClick={reset}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Complete state
  if (state.step === "complete") {
    return (
      <div className="container max-w-lg mx-auto py-8">
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">Bank Connected!</h3>
              <p className="text-muted-foreground">
                Your bank account has been successfully connected.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Redirecting to your sources...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Country & Bank selection
  return (
    <div className="container max-w-lg mx-auto py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sources
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{sourceId ? "Connect Bank Account" : "Connect Your Bank"}</CardTitle>
          <CardDescription>
            {sourceId
              ? "Link your existing account to automatically sync transactions."
              : "Securely connect your bank account to automatically sync transactions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BankSelector
            selectedCountry={state.selectedCountry}
            onCountrySelect={selectCountry}
            onBankSelect={startConnection}
            onBack={state.selectedCountry ? goBackToCountry : undefined}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Security note */}
      <p className="text-xs text-muted-foreground text-center mt-4">
        Powered by TrueLayer. We never see your bank credentials.
        <br />
        Connection is valid for 90 days per PSD2 regulations.
      </p>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="container max-w-lg mx-auto py-8">
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConnectBankPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ConnectBankContent />
    </Suspense>
  );
}
