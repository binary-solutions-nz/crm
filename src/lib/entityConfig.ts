// Declarative schema describing how each Firestore collection maps to a CSV
// file — used by both the export and import sides of the Data Tools page so
// the two stay in lockstep.

import {
  BILLING_CYCLE_LABELS,
  DEVICE_TYPE_LABELS,
  SUBSCRIPTION_CATEGORY_LABELS,
  type BillingCycle,
  type ClientType,
  type DeviceType,
  type EntityStatus,
  type SubscriptionCategory,
} from '../types';

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum';

export interface FieldConfig {
  key: string;
  header: string;
  type: FieldType;
  required?: boolean;
  enumValues?: readonly string[];
  enumLabels?: Record<string, string>;
  example: string;
}

export type EntityKey = 'clients' | 'contacts' | 'devices' | 'services' | 'subscriptions';

export interface EntityConfig {
  key: EntityKey;
  label: string;
  hasClientRef: boolean;
  fields: FieldConfig[];
  // Field(s), together with clientId when hasClientRef, used to match a CSV
  // row to an existing record when no `id` column value is given.
  naturalKeyFields: string[];
}

const CLIENT_TYPE_VALUES: readonly ClientType[] = ['individual', 'organisation'];
const STATUS_VALUES: readonly EntityStatus[] = ['active', 'inactive'];
const DEVICE_TYPE_VALUES: readonly DeviceType[] = [
  'desktop',
  'laptop',
  'server',
  'mobile',
  'network',
  'other',
];
const BILLING_CYCLE_VALUES: readonly BillingCycle[] = ['monthly', 'quarterly', 'annual', 'one-off'];
const SUBSCRIPTION_CATEGORY_VALUES: readonly SubscriptionCategory[] = [
  'software-license',
  'saas-subscription',
  'domain',
  'ssl-certificate',
  'hardware-warranty',
  'support-contract',
  'other',
];

export const ENTITY_CONFIGS: EntityConfig[] = [
  {
    key: 'clients',
    label: 'Clients',
    hasClientRef: false,
    naturalKeyFields: ['name'],
    fields: [
      { key: 'name', header: 'name', type: 'string', required: true, example: 'Acme Ltd' },
      {
        key: 'type',
        header: 'type',
        type: 'enum',
        required: true,
        enumValues: CLIENT_TYPE_VALUES,
        example: 'organisation',
      },
      {
        key: 'status',
        header: 'status',
        type: 'enum',
        required: true,
        enumValues: STATUS_VALUES,
        example: 'active',
      },
      { key: 'primaryContactName', header: 'primaryContactName', type: 'string', example: 'Jane Doe' },
      { key: 'email', header: 'email', type: 'string', example: 'jane@acme.com' },
      { key: 'phone', header: 'phone', type: 'string', example: '+44 20 1234 5678' },
      { key: 'address', header: 'address', type: 'string', example: '1 High Street, London' },
      { key: 'website', header: 'website', type: 'string', example: 'https://acme.com' },
      { key: 'notes', header: 'notes', type: 'string', example: '' },
    ],
  },
  {
    key: 'contacts',
    label: 'Users / Contacts',
    hasClientRef: true,
    naturalKeyFields: ['name'],
    fields: [
      { key: 'name', header: 'name', type: 'string', required: true, example: 'John Smith' },
      { key: 'role', header: 'role', type: 'string', example: 'IT Manager' },
      { key: 'email', header: 'email', type: 'string', example: 'john@acme.com' },
      { key: 'phone', header: 'phone', type: 'string', example: '' },
      { key: 'isPrimary', header: 'isPrimary', type: 'boolean', example: 'true' },
      { key: 'notes', header: 'notes', type: 'string', example: '' },
    ],
  },
  {
    key: 'devices',
    label: 'Devices / PCs',
    hasClientRef: true,
    naturalKeyFields: ['hostname'],
    fields: [
      { key: 'hostname', header: 'hostname', type: 'string', required: true, example: 'DESKTOP-01' },
      {
        key: 'type',
        header: 'type',
        type: 'enum',
        required: true,
        enumValues: DEVICE_TYPE_VALUES,
        enumLabels: DEVICE_TYPE_LABELS,
        example: 'desktop',
      },
      { key: 'os', header: 'os', type: 'string', example: 'Windows 11 Pro' },
      { key: 'serialNumber', header: 'serialNumber', type: 'string', example: '' },
      { key: 'assignedTo', header: 'assignedTo', type: 'string', example: '' },
      { key: 'purchaseDate', header: 'purchaseDate', type: 'date', example: '2024-01-15' },
      { key: 'warrantyExpiry', header: 'warrantyExpiry', type: 'date', example: '2027-01-15' },
      {
        key: 'status',
        header: 'status',
        type: 'enum',
        required: true,
        enumValues: STATUS_VALUES,
        example: 'active',
      },
      { key: 'notes', header: 'notes', type: 'string', example: '' },
    ],
  },
  {
    key: 'services',
    label: 'Services',
    hasClientRef: true,
    naturalKeyFields: ['name'],
    fields: [
      { key: 'name', header: 'name', type: 'string', required: true, example: 'Managed IT Support' },
      { key: 'category', header: 'category', type: 'string', example: 'Managed IT' },
      {
        key: 'status',
        header: 'status',
        type: 'enum',
        required: true,
        enumValues: STATUS_VALUES,
        example: 'active',
      },
      { key: 'cost', header: 'cost', type: 'number', example: '150' },
      {
        key: 'billingCycle',
        header: 'billingCycle',
        type: 'enum',
        enumValues: BILLING_CYCLE_VALUES,
        enumLabels: BILLING_CYCLE_LABELS,
        example: 'monthly',
      },
      { key: 'notes', header: 'notes', type: 'string', example: '' },
    ],
  },
  {
    key: 'subscriptions',
    label: 'Subscriptions',
    hasClientRef: true,
    naturalKeyFields: ['name'],
    fields: [
      { key: 'name', header: 'name', type: 'string', required: true, example: 'Microsoft 365' },
      { key: 'vendor', header: 'vendor', type: 'string', example: 'Microsoft' },
      {
        key: 'category',
        header: 'category',
        type: 'enum',
        required: true,
        enumValues: SUBSCRIPTION_CATEGORY_VALUES,
        enumLabels: SUBSCRIPTION_CATEGORY_LABELS,
        example: 'saas-subscription',
      },
      { key: 'seats', header: 'seats', type: 'number', example: '10' },
      { key: 'cost', header: 'cost', type: 'number', example: '99.99' },
      {
        key: 'billingCycle',
        header: 'billingCycle',
        type: 'enum',
        enumValues: BILLING_CYCLE_VALUES,
        enumLabels: BILLING_CYCLE_LABELS,
        example: 'annual',
      },
      { key: 'purchaseDate', header: 'purchaseDate', type: 'date', example: '2024-03-01' },
      { key: 'renewalDate', header: 'renewalDate', type: 'date', required: true, example: '2025-03-01' },
      { key: 'autoRenew', header: 'autoRenew', type: 'boolean', required: true, example: 'true' },
      {
        key: 'status',
        header: 'status',
        type: 'enum',
        required: true,
        enumValues: STATUS_VALUES,
        example: 'active',
      },
      { key: 'notes', header: 'notes', type: 'string', example: '' },
    ],
  },
];

export function getEntityConfig(key: EntityKey): EntityConfig {
  const found = ENTITY_CONFIGS.find((e) => e.key === key);
  if (!found) throw new Error(`Unknown entity: ${key}`);
  return found;
}
