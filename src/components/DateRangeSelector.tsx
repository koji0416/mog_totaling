"use client";

import { DatePreset, DATE_PRESET_LABELS } from "@/lib/types";

interface Props {
  value: DatePreset;
  onChange: (value: DatePreset) => void;
}

export default function DateRangeSelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DatePreset)}
        className="appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 pr-8 text-sm font-medium text-gray-700 shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-all"
      >
        {Object.entries(DATE_PRESET_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
