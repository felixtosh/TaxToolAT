"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Building2, CheckCircle, Loader2 } from "lucide-react";
import { formatIban } from "@/lib/import/deduplication";
import { BankAccount } from "@/hooks/use-bank-connection";

export default function SelectAccountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectionId = searchParams.get("connectionId");
  const sourceId = searchParams.get("sourceId"); // Existing source to link

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [accountName, setAccountName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [success, setSuccess] = useState(false);
  // Track if we should create new (ignore invalid sourceId)
  const [createNew, setCreateNew] = useState(false);

  // Whether we're linking to an existing source (no name input needed)
  const isLinking = !!sourceId && !createNew;

  // Fetch accounts on mount
  useEffect(() => {
    if (!connectionId) {
      router.push("/sources/connect");
      return;
    }

    async function fetchAccounts() {
      try {
        const response = await fetch(`/api/truelayer/accounts?connectionId=${connectionId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch accounts");
        }

        setAccounts(data.accounts || []);

        // Auto-select if only one account
        if (data.accounts?.length === 1) {
          const account = data.accounts[0];
          setSelectedAccount(account);
          setAccountName(account.ownerName || "Main Account");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch accounts");
      } finally {
        setLoading(false);
      }
    }

    fetchAccounts();
  }, [connectionId, router]);

  const handleSelectAccount = (account: BankAccount) => {
    setSelectedAccount(account);
    setAccountName(account.ownerName || "Main Account");
  };

  const handleCreateSource = async () => {
    if (!selectedAccount || !connectionId) return;
    // Name is only required when creating new source
    if (!isLinking && !accountName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/truelayer/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          accountId: selectedAccount.accountId,
          // If linking to existing source, pass sourceId; otherwise pass name
          ...(isLinking ? { sourceId } : { name: accountName.trim() }),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // If source not found when linking, switch to create mode
        if (data.error === "Source not found" && isLinking) {
          setCreateNew(true);
          setError("The source you were linking to no longer exists. Please enter a name for a new account.");
          return;
        }
        throw new Error(data.error || "Failed to connect bank");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/sources");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect bank");
    } finally {
      setIsCreating(false);
    }
  };

  // Success state
  if (success) {
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

  // Loading state
  if (loading) {
    return (
      <div className="container max-w-lg mx-auto py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading your accounts...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-lg mx-auto py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/sources")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Account</CardTitle>
          <CardDescription>
            Choose which account to connect to TaxStudio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {accounts.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No accounts found. Please try connecting again.
            </div>
          ) : (
            <>
              {/* Account list */}
              <div className="space-y-2">
                {accounts.map((account) => (
                  <button
                    key={account.accountId}
                    type="button"
                    onClick={() => handleSelectAccount(account)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      selectedAccount?.accountId === account.accountId
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{account.ownerName || "Account"}</p>
                      <p className="text-sm font-mono text-muted-foreground">
                        {formatIban(account.iban)}
                      </p>
                    </div>
                    {selectedAccount?.accountId === account.accountId && (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>

              {/* Account name input - only shown when creating new source */}
              {selectedAccount && !isLinking && (
                <div className="space-y-2">
                  <Label htmlFor="accountName">Account Name</Label>
                  <Input
                    id="accountName"
                    value={accountName}
                    onChange={(e) => {
                      setAccountName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="e.g., Business Account"
                  />
                  <p className="text-xs text-muted-foreground">
                    A friendly name to identify this account in TaxStudio
                  </p>
                </div>
              )}

              {/* Info when linking to existing source */}
              {selectedAccount && isLinking && (
                <Alert>
                  <AlertDescription>
                    This bank account will be linked to your existing account.
                    Transactions will be synced automatically.
                  </AlertDescription>
                </Alert>
              )}

              {/* Submit button */}
              <Button
                className="w-full"
                onClick={handleCreateSource}
                disabled={!selectedAccount || (!isLinking && !accountName.trim()) || isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isLinking ? "Linking..." : "Connecting..."}
                  </>
                ) : isLinking ? (
                  "Link Bank Account"
                ) : (
                  "Connect Account"
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
