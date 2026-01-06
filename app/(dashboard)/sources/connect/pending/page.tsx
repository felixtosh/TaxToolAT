"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

export default function PendingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requisitionId = searchParams.get("requisitionId");
  const [checking, setChecking] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const checkStatus = async () => {
    if (!requisitionId) return;

    setChecking(true);
    try {
      const response = await fetch(
        `/api/gocardless/requisitions?id=${requisitionId}&refresh=true`
      );
      const data = await response.json();

      if (response.ok && data.requisition) {
        const status = data.requisition.status;

        if (status === "LN") {
          router.push(`/sources/connect/accounts?requisitionId=${requisitionId}`);
        } else if (status === "RJ" || status === "EX") {
          router.push(
            `/sources/connect/error?message=${encodeURIComponent(
              status === "RJ" ? "Authorization was rejected" : "Request expired"
            )}`
          );
        }
        // Otherwise stay on this page
      }
    } catch (err) {
      console.error("Error checking status:", err);
    } finally {
      setChecking(false);
      setAttempts((a) => a + 1);
    }
  };

  // Auto-check every 5 seconds for the first 2 minutes
  useEffect(() => {
    if (attempts > 24) return; // Stop after 2 minutes

    const timer = setTimeout(() => {
      checkStatus();
    }, 5000);

    return () => clearTimeout(timer);
  }, [attempts]);

  return (
    <div className="container max-w-lg mx-auto py-8">
      <Card>
        <CardHeader className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-2" />
          <CardTitle>Processing Authorization</CardTitle>
          <CardDescription>
            Please wait while we complete your bank connection.
            This may take a moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={checkStatus}
            disabled={checking}
          >
            {checking ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Status
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push("/sources")}
          >
            Cancel
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Checking automatically... {Math.min(attempts, 24)}/24
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
