import { YonserWorkspace } from "@/components/YonserWorkspace";

export default function YonserPage() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <YonserWorkspace />
    </main>
  );
}
