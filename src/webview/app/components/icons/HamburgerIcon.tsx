import { FC } from 'react';

interface Props {
  className?: string;
}

const HamburgerIcon: FC<Props> = ({ className }) => {
  return (
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      style={{ fill: 'currentColor' }}
    >
      <g>
        <rect x="64" y="128" width="384" height="48" />
        <rect x="64" y="232" width="384" height="48" />
        <rect x="64" y="336" width="384" height="48" />
      </g>
    </svg>
  );
};

export default HamburgerIcon;