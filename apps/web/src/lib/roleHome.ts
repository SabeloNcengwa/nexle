import type { MeResponse, UserProfile } from '@mavundla/shared';

const ADMIN_URL = import.meta.env.VITE_ADMIN_BASE_URL ?? 'http://localhost:5174';

export function isStaff(profile: UserProfile | null | undefined): boolean {
  return (profile?.platformRoles?.length ?? 0) > 0;
}

export function isSeller(
  memberships: MeResponse['sellerMemberships'] | undefined,
): boolean {
  return (memberships ?? []).some((m) => m.status === 'active');
}

/** Seller Centre access: seller accounts (or legacy approved members). Customers blocked. */
export function canAccessSellerCentre(
  profile: UserProfile | null | undefined,
  memberships: MeResponse['sellerMemberships'] | undefined,
): boolean {
  if (profile?.accountType === 'customer') return false;
  if (profile?.accountType === 'seller') return true;
  // Legacy profiles without accountType
  return isSeller(memberships);
}

/** Where a signed-in storefront user should land after auth. */
export function storefrontHomePath(
  profile: UserProfile | null | undefined,
  memberships: MeResponse['sellerMemberships'] | undefined,
): string {
  if (canAccessSellerCentre(profile, memberships) && profile?.accountType === 'seller') {
    return '/seller';
  }
  if (canAccessSellerCentre(profile, memberships) && isSeller(memberships)) {
    return '/seller';
  }
  return '/account';
}

export function staffConsoleUrl(): string {
  return ADMIN_URL;
}
