import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PlanResult, Scenario } from "../types";
import { pesoK } from "./ui";

const COLOR = { A: "#8a7f6e", B: "#2f6b3a", C: "#2c6e9b" } as const;
const AXIS = { fontSize: 13, fill: "#5b6152" };

/** Soil nitrogen by season (one line per plan, labelled at its end; Plan A dashed) and 3-year profit with the other climate as a ghost bar. */
export function Charts({ plans, normal, elnino, scenario }: { plans: PlanResult[]; normal: PlanResult[]; elnino: PlanResult[]; scenario: Scenario }) {
  const nData = ["Now", "S1", "S2", "S3", "S4", "S5", "S6"].map((label, i) => {
    const row: Record<string, string | number> = { label };
    for (const p of plans) row[p.id] = Math.round(i === 0 ? p.seasons[0].nStart : p.seasons[i - 1].nEnd);
    return row;
  });
  const other = scenario === "elnino" ? normal : elnino;
  const profitData = plans.map((p, i) => ({ id: p.id, name: `Plan ${p.id}`, current: Math.round(p.kpis.totalProfit), other: Math.round(other[i].kpis.totalProfit) }));
  const endLabel = (id: "A" | "B" | "C") =>
    function EndLabel(props: { x?: number; y?: number; index?: number }) {
      if (props.index !== 6 || props.x === undefined || props.y === undefined) return <g />;
      return (
        <text x={props.x + 8} y={props.y + 4} fontSize={13} fontWeight={700} fill={COLOR[id]}>
          {id}
        </text>
      );
    };

  return (
    <section aria-labelledby="charts-h" className="rounded-lg border border-border bg-card p-4">
      <h2 id="charts-h" className="text-2xl font-bold">
        How the routes compare
      </h2>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <figure>
          <figcaption className="text-sm font-bold">Soil nitrogen, season by season (0–100)</figcaption>
          <div className="mt-2 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={nData} margin={{ top: 8, right: 28, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="#e3dccb" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#8f8877" }} />
                <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={40} />
                <Tooltip />
                <Line dataKey="A" name="Plan A" stroke={COLOR.A} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} label={endLabel("A")} />
                <Line dataKey="C" name="Plan C" stroke={COLOR.C} strokeWidth={2} dot={false} isAnimationActive={false} label={endLabel("C")} />
                <Line dataKey="B" name="Plan B" stroke={COLOR.B} strokeWidth={3} dot={false} isAnimationActive={false} label={endLabel("B")} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
        <figure>
          <figcaption className="text-sm font-bold">
            3-year profit · solid: {scenario === "elnino" ? "El Niño year" : "normal years"}, outline: {scenario === "elnino" ? "normal years" : "El Niño year"}
          </figcaption>
          <div className="mt-2 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profitData} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke="#e3dccb" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickFormatter={pesoK} tickLine={false} axisLine={{ stroke: "#8f8877" }} />
                <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={64} />
                <Tooltip formatter={(v: number) => pesoK(v)} />
                <Bar dataKey="current" name={scenario === "elnino" ? "El Niño" : "Normal"} isAnimationActive={false} radius={[0, 4, 4, 0]}>
                  {profitData.map((d) => (
                    <Cell key={d.id} fill={COLOR[d.id]} />
                  ))}
                </Bar>
                <Bar dataKey="other" name={scenario === "elnino" ? "Normal" : "El Niño"} isAnimationActive={false} radius={[0, 4, 4, 0]}>
                  {profitData.map((d) => (
                    <Cell key={d.id} fill="#ffffff" stroke={COLOR[d.id]} strokeDasharray="4 3" strokeWidth={1.5} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </div>
    </section>
  );
}
