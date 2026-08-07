// Shared domain types for the Binary Solutions CRM.
// All dates that need calendar comparisons (renewals, purchases, warranty)
// are stored as ISO date strings "YYYY-MM-DD" for simple, timezone-stable
// sorting and display. Firestore server timestamps are used for audit fields.

export type ClientType = 'individual' | 'organisation';
export type EntityStatus = 'active' | 'inactive';

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  status: EntityStatus;
  primaryContactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Contact {
  id: string;
  clientId: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type DeviceType = 'desktop' | 'laptop' | 'server' | 'mobile' | 'network' | 'other';

export interface Device {
  id: string;
  clientId: string;
  hostname: string;
  type: DeviceType;
  os?: string;
  serialNumber?: string;
  assignedTo?: string;
  purchaseDate?: string; // YYYY-MM-DD
  warrantyExpiry?: string; // YYYY-MM-DD
  status: EntityStatus;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type BillingCycle = 'monthly' | 'quarterly' | 'annual' | 'one-off';

export interface Service {
  id: string;
  clientId: string;
  name: string;
  category?: string; // e.g. Managed IT, Backup, Email, Hosting
  status: EntityStatus;
  cost?: number;
  billingCycle?: BillingCycle;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type SubscriptionCategory =
  | 'software-license'
  | 'saas-subscription'
  | 'domain'
  | 'ssl-certificate'
  | 'hardware-warranty'
  | 'support-contract'
  | 'other';

export interface Subscription {
  id: string;
  clientId: string;
  name: string;
  vendor?: string;
  category: SubscriptionCategory;
  seats?: number;
  cost?: number;
  billingCycle?: BillingCycle;
  purchaseDate?: string; // YYYY-MM-DD
  renewalDate: string; // YYYY-MM-DD — the key field for reminders
  autoRenew: boolean;
  status: EntityStatus;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

// Human-friendly labels used across the UI.
export const SUBSCRIPTION_CATEGORY_LABELS: Record<SubscriptionCategory, string> = {
  'software-license': 'Software License',
  'saas-subscription': 'SaaS Subscription',
  domain: 'Domain',
  'ssl-certificate': 'SSL Certificate',
  'hardware-warranty': 'Hardware Warranty',
  'support-contract': 'Support Contract',
  other: 'Other',
};

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  desktop: 'Desktop',
  laptop: 'Laptop',
  server: 'Server',
  mobile: 'Mobile',
  network: 'Network',
  other: 'Other',
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  'one-off': 'One-off',
};
