import type { Metadata } from "next";

import { SingpsWorkspace } from "@/components/SingpsWorkspace";

export const metadata: Metadata = {
  title: "Sin GPS — buscar placas",
  description:
    "Ruta tipo Uber a las placas de iPhone 16, Verde, Rojo 6, Blanco 13 y XR Rojo.",
};

export default function SingpsPage() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <SingpsWorkspace />
    </main>
  );
}
