import { ReactNode } from 'react';

type IconProps = { className?: string };

function Svg({ children, className = 'h-[18px] w-[18px]' }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      {children}
    </svg>
  );
}

const ICONS: Record<string, (props: IconProps) => ReactNode> = {
  'recycle-bin': (p) => (
    <Svg {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  ),
  overview: (p) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  ),
  tenants: (p) => (
    <Svg {...p}>
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M9 21v-8h6v8" />
    </Svg>
  ),
  users: (p) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M21 19c-.4-2.4-2-4-4-4" />
    </Svg>
  ),
  inbox: (p) => (
    <Svg {...p}>
      <path d="M4 6h16v12H4z" />
      <path d="M4 13h4.5l1.5 2h4l1.5-2H20" />
    </Svg>
  ),
  'quote-to-cash': (p) => (
    <Svg {...p}>
      <path d="M4 7h16v12H4z" />
      <path d="M8 7V5h8v2" />
      <path d="M8 12h8M8 16h5" />
    </Svg>
  ),
  'people-ops': (p) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c1-4 3.5-6 7-6s6 2 7 6" />
    </Svg>
  ),
  service: (p) => (
    <Svg {...p}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4L16 11l-3-3 1.7-1.7z" />
    </Svg>
  ),
  dispatch: (p) => (
    <Svg {...p}>
      <path d="M3 16V8h11v8" />
      <path d="M14 11h4l3 4v1h-7" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </Svg>
  ),
  automation: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </Svg>
  ),
  field: (p) => (
    <Svg {...p}>
      <rect x="8" y="2" width="8" height="20" rx="2" />
      <path d="M11 5h2M10 18h4" />
    </Svg>
  ),
  'go-live': (p) => (
    <Svg {...p}>
      <path d="M12 3l2.2 6.6H21l-5.4 4 2.1 6.4L12 16.6 6.3 20l2.1-6.4L3 9.6h6.8z" />
    </Svg>
  ),
  leads: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
    </Svg>
  ),
  customers: (p) => (
    <Svg {...p}>
      <circle cx="8" cy="9" r="2.5" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M3.5 19c.5-3 2.4-5 4.5-5s4 2 4.5 5M12 19c.5-3 2.4-5 4.5-5s4 2 4.5 5" />
    </Svg>
  ),
  vendors: (p) => (
    <Svg {...p}>
      <path d="M4 10h16l-1.5 9H5.5z" />
      <path d="M8 10V7h8v3" />
    </Svg>
  ),
  opportunities: (p) => (
    <Svg {...p}>
      <path d="M12 3v18" />
      <path d="M7 8c0-2.2 2.2-4 5-4s5 1.8 5 4-2.2 3-5 3-5 1.3-5 3.5 2.2 3.5 5 3.5 5-1.5 5-3.5" />
    </Svg>
  ),
  quotations: (p) => (
    <Svg {...p}>
      <path d="M7 4h10v16H7z" />
      <path d="M10 8h4M10 12h4M10 16h2" />
    </Svg>
  ),
  'sales-orders': (p) => (
    <Svg {...p}>
      <path d="M7 3h10v18H7z" />
      <path d="M10 8h4M10 12h4M10 16h3" />
      <path d="M7 7h10" />
    </Svg>
  ),
  invoices: (p) => (
    <Svg {...p}>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </Svg>
  ),
  payments: (p) => (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </Svg>
  ),
  products: (p) => (
    <Svg {...p}>
      <path d="M12 3l8 4.5v9L12 21 4 16.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </Svg>
  ),
  stock: (p) => (
    <Svg {...p}>
      <path d="M4 20V10l4-4h8l4 4v10z" />
      <path d="M4 10h16M9 20v-6h6v6" />
    </Svg>
  ),
  warehouses: (p) => (
    <Svg {...p}>
      <path d="M3 20V10l9-6 9 6v10" />
      <path d="M9 20v-7h6v7" />
    </Svg>
  ),
  'purchase-orders': (p) => (
    <Svg {...p}>
      <circle cx="9" cy="20" r="1.6" />
      <circle cx="18" cy="20" r="1.6" />
      <path d="M3 4h2l2.4 11h11.2l2-7H7" />
    </Svg>
  ),
  employees: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c1-4 3.5-6 7-6s6 2 7 6" />
    </Svg>
  ),
  designations: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3" />
      <path d="M6 21v-2a4 4 0 0 1 4-4h4" />
      <path d="M16 14l2 2 4-4" />
    </Svg>
  ),
  shifts: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </Svg>
  ),
  holidays: (p) => (
    <Svg {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </Svg>
  ),
  attendance: (p) => (
    <Svg {...p}>
      <path d="M9 11l2.2 2.2L16 8.5" />
      <circle cx="12" cy="12" r="9" />
    </Svg>
  ),
  'leave-policies': (p) => (
    <Svg {...p}>
      <path d="M7 4h8l3 3v13H7z" />
      <path d="M10 12h6M10 16h4" />
    </Svg>
  ),
  'leave-requests': (p) => (
    <Svg {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16M9 15h6" />
    </Svg>
  ),
  'salary-structures': (p) => (
    <Svg {...p}>
      <path d="M4 18V8l8-4 8 4v10" />
      <path d="M8 18v-5h8v5" />
    </Svg>
  ),
  'payroll-runs': (p) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 10h4M7 14h10" />
    </Svg>
  ),
  'incentive-schemes': (p) => (
    <Svg {...p}>
      <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.8 7.2 17.9l.9-5.4L4.2 8.7l5.4-.8z" />
    </Svg>
  ),
  'incentive-awards': (p) => (
    <Svg {...p}>
      <circle cx="12" cy="9" r="5" />
      <path d="M8.5 13.5 7 21l5-3 5 3-1.5-7.5" />
    </Svg>
  ),
  'service-tickets': (p) => (
    <Svg {...p}>
      <path d="M4 8a3 3 0 0 0 0 6v4h16v-4a3 3 0 0 0 0-6V4H4z" />
      <path d="M9 12h6" />
    </Svg>
  ),
  'pick-lists': (p) => (
    <Svg {...p}>
      <path d="M9 7h11M9 12h11M9 17h11" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" />
    </Svg>
  ),
  shipments: (p) => (
    <Svg {...p}>
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h5l2 4v3h-7" />
      <circle cx="7" cy="18.5" r="1.5" />
      <circle cx="17" cy="18.5" r="1.5" />
    </Svg>
  ),
  'ledger-accounts': (p) => (
    <Svg {...p}>
      <path d="M4 5h16v14H4z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </Svg>
  ),
  vouchers: (p) => (
    <Svg {...p}>
      <path d="M4 7h16v10l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M8 11h8" />
    </Svg>
  ),
  'recurring-schedules': (p) => (
    <Svg {...p}>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 5v4h4" />
    </Svg>
  ),
  'bank-accounts': (p) => (
    <Svg {...p}>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v8h14v-8" />
      <path d="M3 18h18" />
    </Svg>
  ),
  'bank-transactions': (p) => (
    <Svg {...p}>
      <path d="M7 10H3V6" />
      <path d="M3 10c2-4 6-6 10-6 4.4 0 8 3.6 8 8" />
      <path d="M17 14h4v4" />
      <path d="M21 14c-2 4-6 6-10 6-4.4 0-8-3.6-8-8" />
    </Svg>
  ),
  tasks: (p) => (
    <Svg {...p}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </Svg>
  ),
  conversations: (p) => (
    <Svg {...p}>
      <path d="M5 18v-2.5A6.5 6.5 0 0 1 11.5 9H18a4 4 0 0 1 0 8h-3l-4 3v-3H8" />
    </Svg>
  ),
  channels: (p) => (
    <Svg {...p}>
      <path d="M5 12h14" />
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4c2 2.8 3 5.5 3 8s-1 5.2-3 8M12 4c-2 2.8-3 5.5-3 8s1 5.2 3 8" />
    </Svg>
  ),
  'marketplace-listings': (p) => (
    <Svg {...p}>
      <path d="M4 9h16l-1.4 10H5.4z" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
    </Svg>
  ),
  'marketplace-orders': (p) => (
    <Svg {...p}>
      <path d="M6 7h12l-1 12H7z" />
      <path d="M9 7V6a3 3 0 0 1 6 0v1" />
    </Svg>
  ),
  imports: (p) => (
    <Svg {...p}>
      <path d="M12 4v12" />
      <path d="M8 12l4 4 4-4" />
      <path d="M5 20h14" />
    </Svg>
  ),
  branches: (p) => (
    <Svg {...p}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M8 7.5 10.5 16M16 7.5 13.5 16" />
    </Svg>
  ),
  departments: (p) => (
    <Svg {...p}>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M10 20v-6h4v6" />
    </Svg>
  ),
  roles: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c1-3.5 3.4-5.5 7-5.5S18 16.5 19 20" />
      <path d="M17 4l2 2 3-3" />
    </Svg>
  ),
  sequences: (p) => (
    <Svg {...p}>
      <path d="M8 7h11M8 12h11M8 17h11" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" />
    </Svg>
  ),
  settings: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  ),
  'fiscal-years': (p) => (
    <Svg {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </Svg>
  ),
  notifications: (p) => (
    <Svg {...p}>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Svg>
  ),
  'audit-events': (p) => (
    <Svg {...p}>
      <path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? ICONS.overview;
  return <Icon className={className} />;
}
