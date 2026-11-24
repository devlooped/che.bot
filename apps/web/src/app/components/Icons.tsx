import type { ReactNode } from "react";

// The line icons of the buttons that are only an icon (.icon-button), drawn with the stroke of
// their text. The help of the run page shows them beside what each does.

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ShareIcon = () => (
  <Icon>
    <circle cx="18" cy="5" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="19" r="2.6" />
    <path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

/** Two arrows around a circle: ask again. */
export const RefreshIcon = () => (
  <Icon>
    <path d="M19.5 12a7.5 7.5 0 0 1-13.1 5" />
    <path d="M4.5 12a7.5 7.5 0 0 1 13.1-5" />
    <path d="M17.8 3.2v3.9h-3.9M6.2 20.8v-3.9h3.9" />
  </Icon>
);

/** A framed landscape: draw the picture of a question again. */
export const ImageIcon = () => (
  <Icon>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="9.5" r="1.6" />
    <path d="M4 17.5l5-5 3.5 3.5 2.5-2.5 5 5" />
  </Icon>
);

/** A square in a circle: stop a question in progress. */
export const StopIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <rect x="9" y="9" width="6" height="6" rx="0.8" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.9 13h9.2l.9-13M10.2 10v6.5M13.8 10v6.5" />
  </Icon>
);

/** The icons of the header's round buttons, smaller. */
export const HomeIcon = () => (
  <Icon size={16}>
    <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 21v-7h6v7" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon size={16}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

/** The switch of the theme: a moon on the light page, a sun on the dark one. */
export const MoonIcon = () => (
  <Icon size={16}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
);

export const SunIcon = () => (
  <Icon size={16}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);

export const ProfileIcon = () => (
  <Icon size={16}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </Icon>
);

export const HelpIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.7 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.5v.5" />
    <circle cx="12" cy="16.6" r="0.3" />
  </Icon>
);
