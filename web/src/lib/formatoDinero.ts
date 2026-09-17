export function formatearCOP(val: string | number | undefined): string {
  if (val == null || val === "") return "—";
  const n =
    typeof val === "string" ? Number(val.replace(/,/g, "")) : Number(val);
  if (Number.isNaN(n)) return String(val);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}
