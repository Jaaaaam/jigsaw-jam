import type { SVGProps } from "react";

/**
 * Minimal stroke icon set — consistent 24px grid, inherits currentColor.
 * Kept in-house so the HUD reads as one calm system instead of emoji noise.
 */
function base(props: SVGProps<SVGSVGElement>) {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M19 12H5m7-7-7 7 7 7" /></svg>
);
export const PauseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 5v14M15 5v14" /></svg>
);
export const PlayIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" /></svg>
);
export const ImageIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
    <path d="m4 18 5-5 3 3 4-4 4 4" />
  </svg>
);
export const GhostIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 11a7 7 0 0 1 14 0v8l-2.3-1.7L14.4 19l-2.4-1.7L9.6 19l-2.3-1.7L5 19z" />
    <circle cx="9.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="11" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const FrameIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
    <rect x="9" y="9" width="6" height="6" rx="1" strokeDasharray="2.5 2.5" />
  </svg>
);
export const LayersIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>
);
export const BulbIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 18h6m-5 3h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.9.7 1.5 1.6 1.5 2.6h4c0-1 .6-1.9 1.5-2.6A6 6 0 0 0 12 3z" />
  </svg>
);
export const TidyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 20h16M6 20l1.2-4.5M18 20l-1.2-4.5" />
    <path d="M8.5 15.5 12 4l3.5 11.5z" />
  </svg>
);
export const ShuffleIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 7h3.5c5.5 0 8.5 10 14 10H21" />
    <path d="M3 17h3.5c2 0 3.6-1.3 5-3M21 7h-.5c-2.7 0-4.6 2.4-6.2 4.9" />
    <path d="m18.5 4.5 3 2.5-3 2.5M18.5 14.5l3 2.5-3 2.5" />
  </svg>
);
export const GearIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v3M12 18.2v3M21.2 12h-3M5.8 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6 5.5 5.5" />
  </svg>
);
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const MinusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 12h14" /></svg>
);
export const FitIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5V9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15M15 20h3.5a1.5 1.5 0 0 0 1.5-1.5V15" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </svg>
);
export const FullscreenIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
  </svg>
);
export const SpeakerIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 9v6h3.5L12 19V5L7.5 9z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
  </svg>
);
export const SpeakerOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 9v6h3.5L12 19V5L7.5 9z" />
    <path d="m16 9.5 5 5m0-5-5 5" />
  </svg>
);
export const SunIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" />
  </svg>
);
export const MoonIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" /></svg>
);
export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12z" /></svg>
);
export const SendIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m4 12 16-7-4.5 14-3.5-5.5zM12 13.5 20 5" /></svg>
);
export const ToolsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M14.5 6.5a4 4 0 0 1 5-3.9l-2.7 2.7 1.9 1.9L21.4 4.5a4 4 0 0 1-5.4 4.8L7.5 17.8a2 2 0 1 1-2.8-2.8l8.5-8.5z" />
  </svg>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m6 6 12 12M18 6 6 18" /></svg>
);
export const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
