import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function LogTable({ rows, cols }: { rows?: any[]; cols: string[] }) {
  if (!rows) return <p className="text-sm text-slate-500">…</p>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50"><tr>{cols.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">{cols.map((c) => <td key={c} className="px-3 py-2">{c === "status" && typeof r[c] === "string" ? <Badge value={r[c]} /> : String(r[c] ?? "")}</td>)}</tr>
          ))}
          {!rows.length && <tr><td className="px-3 py-3 text-slate-500" colSpan={cols.length}>—</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}
