import { Line, LineChart, ResponsiveContainer } from "recharts";

export function Sparkline({ values, width = 88, height = 26 }) {
  const nums = values.map((v) => (v == null ? 0 : Number(v)));
  const up = nums[nums.length - 1] >= nums[0];
  const data = nums.map((v, i) => ({ i, v }));
  const color = up ? "var(--color-good)" : "var(--color-critical)";
  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
