"use client";
interface Props {
  value: 'FREE' | 'PRO';
  onChange: (v: 'FREE' | 'PRO') => void;
  disabled?: boolean;
}

export function TierSelect({ value, onChange, disabled }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as 'FREE' | 'PRO')}
      disabled={disabled}
      className="px-2 py-1 text-xs bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="FREE">FREE</option>
      <option value="PRO">PRO</option>
    </select>
  );
}
