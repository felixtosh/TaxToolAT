export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-y-auto">
      {children}
    </div>
  );
}
