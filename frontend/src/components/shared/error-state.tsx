import { AlertTriangle } from "lucide-react";

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
      <div className="space-y-2">
        <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
        <p className="text-sm text-destructive">{message}</p>
      </div>
    </div>
  );
}
