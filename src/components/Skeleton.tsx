export function MetricSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-100 p-4">
          <div className="skeleton h-3 w-12 mb-3" />
          <div className="skeleton h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 flex gap-8">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="skeleton h-3 w-16" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-4 py-4 border-t border-gray-100 flex gap-8">
          <div className="skeleton h-4 w-40" />
          {Array.from({ length: 6 }).map((_, j) => (
            <div key={j} className="skeleton h-4 w-16" />
          ))}
        </div>
      ))}
    </div>
  );
}

const ACCOUNT_WIDTHS = ["75%", "90%", "65%", "85%", "70%", "95%", "80%", "60%"];

export function AccountSkeleton() {
  return (
    <div className="p-3 space-y-2">
      {ACCOUNT_WIDTHS.map((w, i) => (
        <div key={i} className="px-4 py-3">
          <div className="skeleton h-4 w-full" style={{ maxWidth: w }} />
        </div>
      ))}
    </div>
  );
}
