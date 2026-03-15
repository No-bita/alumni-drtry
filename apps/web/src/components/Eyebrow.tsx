type EyebrowProps = {
  children: React.ReactNode;
  light?: boolean;
  className?: string;
};

export function Eyebrow({ children, light, className = "" }: EyebrowProps) {
  return (
    <p className={`eyebrow ${light ? "eyebrow-light" : ""} ${className}`.trim()}>
      {children}
    </p>
  );
}
