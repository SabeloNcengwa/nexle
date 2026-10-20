export const PLATFORM_ROLES = [
  'support_agent',
  'catalogue_moderator',
  'finance_operator',
  'super_admin',
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const SELLER_ROLES = ['seller_owner', 'seller_manager', 'seller_staff'] as const;

export type SellerRole = (typeof SELLER_ROLES)[number];

export const SELLER_PERMISSIONS = [
  'seller:read',
  'seller:manage_profile',
  'seller:manage_members',
  'seller:manage_products',
  'seller:manage_inventory',
  'seller:manage_orders',
  'seller:manage_returns',
  'seller:view_finance',
] as const;

export type SellerPermission = (typeof SELLER_PERMISSIONS)[number];

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<SellerRole, SellerPermission[]> = {
  seller_owner: [...SELLER_PERMISSIONS],
  seller_manager: [
    'seller:read',
    'seller:manage_profile',
    'seller:manage_products',
    'seller:manage_inventory',
    'seller:manage_orders',
    'seller:manage_returns',
    'seller:view_finance',
  ],
  seller_staff: [
    'seller:read',
    'seller:manage_products',
    'seller:manage_inventory',
    'seller:manage_orders',
  ],
};

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function isSellerPermission(value: string): value is SellerPermission {
  return (SELLER_PERMISSIONS as readonly string[]).includes(value);
}
