/** Sedes SP (Supabase) para cartera real. Override con SP_SUPABASE_URLS / SP_SUPABASE_ANON_KEYS (CSV). */

export type SpSede = { nombre: string; url: string; anonKey: string };

// ponytail: anon keys de solo-lectura; techo = rotar a env si alguna sede cierra RLS en atrasos.
const SP_SEDES_DEFAULT: SpSede[] = [
  {
    nombre: "bogota",
    url: "https://ziihqvtjacqzwmcmpiyp.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppaWhxdnRqYWNxendtY21waXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODYyODEsImV4cCI6MjA5OTU2MjI4MX0.DpEws4CRAb3B6Y35TJ7o0afxpaFu56Jfsh-9IKeCQkc",
  },
  {
    nombre: "girardot",
    url: "https://iilgrapnrkwdcouielwz.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpbGdyYXBucmt3ZGNvdWllbHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NDEyODEsImV4cCI6MjA5NjUxNzI4MX0.82GJcFxinFQqxI8OSh40JdivYWK9hr1GRw6lyiqW_3E",
  },
  {
    nombre: "bga",
    url: "https://ngjpndqmkhhdqjjljfmp.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nanBuZHFta2hoZHFqamxqZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTAzNjAsImV4cCI6MjEwMDQ4NjM2MH0.98FK60wSqwhfxbdnHM8rESkDLD6v3p0V6D6bFM3zACY",
  },
];

export function getSpSedes(): SpSede[] {
  const urls = process.env.SP_SUPABASE_URLS?.split(",").map((s) => s.trim()).filter(Boolean);
  const keys = process.env.SP_SUPABASE_ANON_KEYS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (urls?.length && keys?.length && urls.length === keys.length) {
    return urls.map((url, i) => ({
      nombre: `sp${i + 1}`,
      url: url.replace(/\/$/, ""),
      anonKey: keys[i]!,
    }));
  }
  return SP_SEDES_DEFAULT;
}
