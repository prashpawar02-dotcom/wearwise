import * as React from "react";

/**
 * WearWise icon set — calm, stroked line icons plus minimal garment
 * illustrations. Pure SVG, no external dependency. Size with a className
 * (e.g. `className="h-4 w-4"`) or width/height props; both override defaults.
 */
export type IconProps = React.SVGProps<SVGSVGElement>;

const base = (
  child: React.ReactNode,
  viewBox: string,
  extra: Partial<React.SVGProps<SVGSVGElement>> = {}
) =>
  function IconCmp({ width = 24, height = 24, ...props }: IconProps) {
    return (
      <svg
        viewBox={viewBox}
        width={width}
        height={height}
        aria-hidden="true"
        focusable="false"
        {...extra}
        {...props}
      >
        {child}
      </svg>
    );
  };

const stroke: Partial<React.SVGProps<SVGSVGElement>> = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const Icon = {
  Sun: base(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>,
    "0 0 24 24",
    stroke
  ),
  Cloud: base(
    <path d="M18 10a6 6 0 0 0-11.45-1.5A4 4 0 0 0 7 16h11a4 4 0 0 0 0-8z" />,
    "0 0 24 24",
    stroke
  ),
  Sparkle: base(
    <>
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
    </>,
    "0 0 24 24",
    { fill: "currentColor" }
  ),
  Check: base(<path d="M5 12.5l4.5 4.5L19 7" />, "0 0 24 24", { ...stroke, strokeWidth: 1.6 }),
  Lock: base(
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>,
    "0 0 24 24",
    stroke
  ),
  Droplet: base(<path d="M12 3.2l5 6.3a6.4 6.4 0 1 1-10 0z" />, "0 0 24 24", stroke),
  Basket: base(
    <>
      <path d="M5 9h14l-1.2 9.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 9l2.2-4.5M15 9l-2.2-4.5M3.5 9h17" />
    </>,
    "0 0 24 24",
    stroke
  ),
  ArrowRight: base(<path d="M5 12h14M13 6l6 6-6 6" />, "0 0 24 24", stroke),
  ArrowLeft: base(<path d="M19 12H5M11 6l-6 6 6 6" />, "0 0 24 24", stroke),
  Plus: base(<path d="M12 5v14M5 12h14" />, "0 0 24 24", stroke),
  Close: base(<path d="M6 6l12 12M18 6L6 18" />, "0 0 24 24", stroke),
  Camera: base(
    <>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="4" />
    </>,
    "0 0 24 24",
    stroke
  ),
  Home: base(
    <path d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
    "0 0 24 24",
    stroke
  ),
  Hanger: base(
    <>
      <path d="M12 9V7.5a2 2 0 1 1 2 2" />
      <path d="M3.5 17L12 11l8.5 6c.6.4.3 1.3-.4 1.3H3.9c-.7 0-1-.9-.4-1.3z" />
    </>,
    "0 0 24 24",
    stroke
  ),
  Calendar: base(
    <>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M4 10h16M9 4v4M15 4v4" />
    </>,
    "0 0 24 24",
    stroke
  ),
  User: base(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </>,
    "0 0 24 24",
    stroke
  ),
  Heart: base(
    <path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5 6 5c2 0 3.5 1 6 3 2.5-2 4-3 6-3 3.5 0 5 4 3.5 7C19 16.5 12 21 12 21z" />,
    "0 0 24 24",
    stroke
  ),
  Shuffle: base(
    <path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5" />,
    "0 0 24 24",
    stroke
  ),
  Settings: base(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>,
    "0 0 24 24",
    stroke
  ),
  Briefcase: base(
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </>,
    "0 0 24 24",
    stroke
  ),
  Coffee: base(
    <>
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M17 10h2a3 3 0 0 1 0 6h-2M7 1v3M11 1v3M15 1v3" />
    </>,
    "0 0 24 24",
    stroke
  ),
  Wine: base(
    <path d="M8 22h8M12 17v5M6 3h12l-1 6a5 5 0 0 1-10 0z" />,
    "0 0 24 24",
    stroke
  ),
  Plane: base(
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />,
    "0 0 24 24",
    stroke
  ),
  GraduationCap: base(
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
    </>,
    "0 0 24 24",
    stroke
  ),
  Dumbbell: base(
    <path d="M2 12h2M6 7v10M10 9v6M14 9v6M18 7v10M20 12h2" />,
    "0 0 24 24",
    stroke
  ),
  Filter: base(<path d="M3 5h18l-7 9v6l-4-2v-4z" />, "0 0 24 24", stroke),
  Search: base(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>,
    "0 0 24 24",
    stroke
  ),
  More: base(
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>,
    "0 0 24 24",
    { fill: "currentColor" }
  ),
} satisfies Record<string, (props: IconProps) => React.JSX.Element>;

export type IconName = keyof typeof Icon;

const garmentStroke: Partial<React.SVGProps<SVGSVGElement>> = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.2,
  strokeLinejoin: "round",
};

export const Garment = {
  Shirt: base(
    <>
      <path d="M30 22 L42 18 L50 24 L58 18 L70 22 L82 32 L74 40 L70 36 L70 82 L30 82 L30 36 L26 40 L18 32 Z" />
      <path d="M42 18 C 44 26, 50 28, 50 28 C 50 28, 56 26, 58 18" />
      <path d="M50 28 L50 42" strokeDasharray="1 3" />
    </>,
    "0 0 100 100",
    garmentStroke
  ),
  Tshirt: base(
    <path d="M28 26 L42 20 Q50 28 58 20 L72 26 L82 36 L74 42 L70 38 L70 80 L30 80 L30 38 L26 42 L18 36 Z" />,
    "0 0 100 100",
    garmentStroke
  ),
  Pants: base(
    <>
      <path d="M28 18 L72 18 L74 50 L66 86 L54 86 L52 50 L48 50 L46 86 L34 86 L26 50 Z" />
      <path d="M28 24 L72 24" strokeDasharray="1 2" />
    </>,
    "0 0 100 100",
    garmentStroke
  ),
  Jeans: base(
    <>
      <path d="M30 16 L70 16 L72 46 L66 86 L54 86 L51 50 L49 50 L46 86 L34 86 L28 46 Z" />
      <path d="M30 22 L70 22M50 22 L51 50M50 22 L49 50" strokeDasharray="1 2" />
    </>,
    "0 0 100 100",
    garmentStroke
  ),
  Loafer: base(
    <>
      <path d="M8 34 Q10 22 28 22 L70 22 Q88 22 90 34 Q92 44 80 46 L18 46 Q6 44 8 34 Z" />
      <path d="M40 30 Q50 26 60 30M44 30 L44 36M56 30 L56 36" />
    </>,
    "0 0 100 60",
    garmentStroke
  ),
  Sneaker: base(
    <>
      <path d="M10 38 Q12 22 30 22 L46 22 L54 28 L72 28 Q88 30 90 40 Q90 46 84 48 L18 48 Q10 46 10 38 Z" />
      <path d="M30 22 L34 28L46 28M40 32L40 38M48 32L48 38" />
    </>,
    "0 0 100 60",
    garmentStroke
  ),
  Jacket: base(
    <>
      <path d="M28 20 L42 16 L50 26 L58 16 L72 20 L82 34 L72 42 L72 84 L50 84 L50 80 L28 84 L28 42 L18 34 Z" />
      <path d="M50 26 L50 80M42 16 L50 26 L58 16" />
      <circle cx="55" cy="44" r="1" />
      <circle cx="55" cy="56" r="1" />
      <circle cx="55" cy="68" r="1" />
    </>,
    "0 0 100 100",
    garmentStroke
  ),
  Sweater: base(
    <>
      <path d="M26 28 L40 22 Q50 30 60 22 L74 28 L82 38 L74 46 L72 42 L72 82 L28 82 L28 42 L26 46 L18 38 Z" />
      <path d="M40 22 Q50 28 60 22M38 78 L62 78" strokeDasharray="1 2" />
    </>,
    "0 0 100 100",
    garmentStroke
  ),
  Belt: base(
    <>
      <path d="M6 12 L94 12 L94 20 L6 20 Z" />
      <rect x="36" y="10" width="14" height="12" rx="1" />
      <path d="M44 16 L52 16" />
    </>,
    "0 0 100 30",
    garmentStroke
  ),
  Watch: base(
    <>
      <rect x="14" y="34" width="32" height="32" rx="4" />
      <path d="M22 34 L24 14 L36 14 L38 34M22 66 L24 86 L36 86 L38 66" />
      <circle cx="30" cy="50" r="2" />
    </>,
    "0 0 60 100",
    garmentStroke
  ),
  Dress: base(
    <>
      <path d="M36 18 L50 22 L64 18 L70 36 L78 86 L22 86 L30 36 Z" />
      <path d="M36 18 L50 28 L64 18" />
    </>,
    "0 0 100 100",
    garmentStroke
  ),
  Skirt: base(
    <>
      <path d="M30 24 L70 24 L82 84 L18 84 Z" />
      <path d="M30 30 L70 30" strokeDasharray="1 2" />
    </>,
    "0 0 100 100",
    garmentStroke
  ),
} satisfies Record<string, (props: IconProps) => React.JSX.Element>;

export type GarmentKind = keyof typeof Garment;
