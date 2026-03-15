import { type ButtonHTMLAttributes } from "react";

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  size?: "default" | "sm";
  children: React.ReactNode;
};

export function Chip({
  active = false,
  size = "default",
  className = "",
  children,
  ...props
}: ChipProps) {
  const classes = [
    "chip",
    active && "chip--active",
    size === "sm" && "chip--sm",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
