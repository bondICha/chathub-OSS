import { FC } from 'react';

interface Props {
  className?: string;
}

/**
 * Copy/duplicate icon
 * Two overlapping rectangles representing document duplication
 */
const CopyIcon: FC<Props> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      className={className}
      style={{ fill: 'currentColor' }}
    >
      <g>
        <path d="M4 1a2 2 0 0 0-2 2v8h1V3a1 1 0 0 1 1-1h8V1H4z" />
        <path d="M6 5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5z" />
      </g>
    </svg>
  );
};

export default CopyIcon;
