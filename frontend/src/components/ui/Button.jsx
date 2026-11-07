import { forwardRef } from "react";
import { LoaderCircle } from "lucide-react";

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-brand-500",
  subtle: "text-slate-600 hover:bg-slate-100 focus-visible:ring-brand-500",
  danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500",
};

export const Button = forwardRef(function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  children,
  ...props
}, ref) {
  const sizes = {
    sm: "min-h-9 px-3 text-xs",
    md: "min-h-10 px-4 text-sm",
    lg: "min-h-12 px-5 text-sm",
  };
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />}
      {children}
    </button>
  );
});
