export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed p-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}
