interface Props {
  label: string;
  value: string;
  accent: string; // Tailwindのカラークラス (例: "blue", "green")
}

const accentStyles: Record<string, { bg: string; text: string; border: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  green:  { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  amber:  { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  rose:   { bg: "bg-rose-50",   text: "text-rose-700",   border: "border-rose-200" },
  cyan:   { bg: "bg-cyan-50",   text: "text-cyan-700",   border: "border-cyan-200" },
};

export default function MetricCard({ label, value, accent }: Props) {
  const style = accentStyles[accent] || accentStyles.blue;

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 transition-shadow hover:shadow-md`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${style.text} opacity-70`}>
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${style.text}`}>
        {value}
      </div>
    </div>
  );
}
