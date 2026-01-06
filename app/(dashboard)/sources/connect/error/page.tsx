"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function ConnectErrorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = searchParams.get("message") || "An error occurred while connecting your bank.";

  return (
    <div className="container max-w-lg mx-auto py-8">
      <Card>
        <CardHeader className="text-center">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
          <CardTitle>Connection Failed</CardTitle>
          <CardDescription>{decodeURIComponent(message)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="default"
            className="w-full"
            onClick={() => router.push("/sources/connect")}
          >
            Try Again
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push("/sources")}
          >
            Back to Sources
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
