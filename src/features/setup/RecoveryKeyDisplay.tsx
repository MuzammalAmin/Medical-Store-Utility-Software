/** Shows a recovery key with each 4-character group kept on one line, so it is easy to copy by hand. */
export function RecoveryKeyDisplay({ value }: { value: string | undefined }) {
  return (
    <div
      aria-label="Recovery key"
      className="flex flex-wrap justify-center gap-x-1 gap-y-2 rounded-lg border-2 border-dashed border-primary bg-primary-soft/40 p-5 font-mono text-lg font-semibold tracking-wider select-all"
    >
      {value
        ? value.split('-').map((group, i, all) => (
            <span key={i} className="whitespace-nowrap">
              {group}
              {i < all.length - 1 && <span className="text-muted-foreground">-</span>}
            </span>
          ))
        : '…'}
    </div>
  );
}
