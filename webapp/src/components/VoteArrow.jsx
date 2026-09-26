const UP_PATH = 'M12 4 19 12 14.5 12 14.5 20 9.5 20 9.5 12 5 12 Z';
const DOWN_PATH = 'M12 20 19 12 14.5 12 14.5 4 9.5 4 9.5 12 5 12 Z';

export default function VoteArrow({ direction, size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === 'up' ? UP_PATH : DOWN_PATH} />
    </svg>
  );
}
