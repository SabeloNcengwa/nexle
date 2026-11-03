import type { AccountType } from '@mavundla/shared';
import { SA_PROVINCES } from '@mavundla/shared';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { AddressMapPicker, type AddressMapValue } from '../components/AddressMapPicker';
import { apiFetch } from '../lib/api';
import { firebaseAuth } from '../lib/firebase';
import styles from '../components/ui.module.scss';
import { canAccessSellerCentre, isSeller } from '../lib/roleHome';

type AddressForm = AddressMapValue & { line2: string };

const emptyAddress = (): AddressForm => ({
  line1: '',
  line2: '',
  suburb: '',
  city: '',
  province: 'Gauteng',
  postalCode: '',
  lat: undefined,
  lng: undefined,
});

export function AccountPage() {
  const { profile, user, memberships, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const seller = isSeller(memberships);
  const sellerCentreOk = canAccessSellerCentre(profile, memberships);
  const sellerOnlyNotice = params.get('notice') === 'seller-only';
  const needsAccountType = Boolean(profile && !profile.accountType && !seller);
  const canCorrectToSeller = Boolean(
    profile && profile.accountType === 'customer' && sellerOnlyNotice && !seller,
  );

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(emptyAddress());
  const [contactBusy, setContactBusy] = useState(false);
  const [contactMessage, setContactMessage] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [typeBusy, setTypeBusy] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName ?? '');
    setPhone(profile.phone ?? '');
    const a = profile.defaultShippingAddress;
    setAddress(
      a
        ? {
            line1: a.line1 ?? '',
            line2: a.line2 ?? '',
            suburb: a.suburb ?? '',
            city: a.city ?? '',
            province: a.province || 'Gauteng',
            postalCode: a.postalCode ?? '',
            lat: a.lat,
            lng: a.lng,
          }
        : emptyAddress(),
    );
  }, [profile]);

  const chooseAccountType = async (accountType: AccountType) => {
    if (!profile?.displayName) return;
    setTypeBusy(true);
    setTypeError(null);
    try {
      await apiFetch('/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: profile.displayName, accountType }),
      });
      await refreshProfile();
      if (accountType === 'seller') navigate('/seller', { replace: true });
    } catch {
      setTypeError('Could not save account type. Try again.');
    } finally {
      setTypeBusy(false);
    }
  };

  const onSaveContact = async (e: FormEvent) => {
    e.preventDefault();
    setContactMessage(null);
    setContactError(null);
    if (!displayName.trim()) {
      setContactError('Display name is required.');
      return;
    }
    if (!/^\d{4}$/.test(address.postalCode.trim())) {
      setContactError('Postal code must be 4 digits.');
      return;
    }
    setContactBusy(true);
    try {
      await apiFetch('/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName.trim(),
          phone: phone.trim() || undefined,
          defaultShippingAddress: {
            line1: address.line1.trim(),
            line2: address.line2.trim() || undefined,
            suburb: address.suburb.trim(),
            city: address.city.trim(),
            province: address.province.trim(),
            postalCode: address.postalCode.trim(),
            country: 'ZA',
            ...(typeof address.lat === 'number' && typeof address.lng === 'number'
              ? { lat: address.lat, lng: address.lng }
              : {}),
          },
        }),
      });
      await refreshProfile();
      setContactMessage('Contact details saved.');
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Could not save details.');
    } finally {
      setContactBusy(false);
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    setPwError(null);
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    const current = firebaseAuth.currentUser;
    if (!current?.email) {
      setPwError('You must be signed in to change your password.');
      return;
    }
    setPwBusy(true);
    try {
      const cred = EmailAuthProvider.credential(current.email, currentPassword);
      await reauthenticateWithCredential(current, cred);
      await updatePassword(current, newPassword);
      setPwMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPwError('Could not update password. Check your current password and try again.');
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className={styles.stack} style={{ maxWidth: 720 }}>
      <div className={styles.panel}>
        <h1>My account</h1>
        {sellerOnlyNotice && !needsAccountType && !canCorrectToSeller && (
          <p className={styles.error}>
            Seller Centre is only for seller accounts. This login is a customer account. To sell,
            sign out and register a new seller account.
          </p>
        )}
        {(needsAccountType || canCorrectToSeller) && (
          <div className={styles.stack} style={{ marginBottom: '1rem' }}>
            <p className={styles.error}>
              {canCorrectToSeller
                ? 'This account was saved as Customer. If you meant to sell, switch once — this cannot be undone.'
                : 'Your account type was not saved at registration. Choose once — this cannot be changed later.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={styles.btn}
                disabled={typeBusy}
                onClick={() => void chooseAccountType('seller')}
              >
                I want to sell
              </button>
              {!canCorrectToSeller && (
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={typeBusy}
                  onClick={() => void chooseAccountType('customer')}
                >
                  I want to shop
                </button>
              )}
            </div>
            {typeError && <p className={styles.error}>{typeError}</p>}
          </div>
        )}
        <p className={styles.muted}>{profile?.email ?? user?.email}</p>
        <p className={styles.muted}>
          Account type:{' '}
          {profile?.accountType === 'seller'
            ? 'Seller'
            : profile?.accountType === 'customer'
              ? 'Customer'
              : seller
                ? 'Seller (legacy)'
                : 'Not set'}
        </p>
        <p>
          <Link to="/orders">Order history</Link>
          {' · '}
          <Link to="/browse">Continue shopping</Link>
          {sellerCentreOk && (
            <>
              {' · '}
              <Link to="/seller">Seller Centre</Link>
            </>
          )}
        </p>
      </div>

      <form className={`${styles.panel} ${styles.stack}`} onSubmit={(e) => void onSaveContact(e)}>
        <h2>Contact &amp; delivery</h2>
        <p className={styles.muted}>
          Phone and address so we (and sellers) can reach you for orders and delivery.
        </p>
        <label className={styles.field}>
          Display name
          <input
            required
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Mobile number
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="e.g. 082 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <AddressAutocomplete
          required
          value={address.line1}
          onInputChange={(line1) => setAddress((a) => ({ ...a, line1 }))}
          onSelect={(next) =>
            setAddress({
              ...next,
              line2: address.line2,
            })
          }
        />
        <label className={styles.field}>
          Apartment / complex (optional)
          <input
            autoComplete="address-line2"
            value={address.line2}
            onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          Suburb
          <input
            required
            autoComplete="address-level3"
            value={address.suburb}
            onChange={(e) => setAddress((a) => ({ ...a, suburb: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          City
          <input
            required
            autoComplete="address-level2"
            value={address.city}
            onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          Province
          <select
            required
            value={address.province}
            onChange={(e) => setAddress((a) => ({ ...a, province: e.target.value }))}
          >
            {SA_PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Postal code
          <input
            required
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="\d{4}"
            maxLength={4}
            value={address.postalCode}
            onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))}
          />
        </label>
        <AddressMapPicker
          value={address}
          onChange={(next) =>
            setAddress({
              ...next,
              line2: next.line2 ?? '',
            })
          }
        />
        <p className={styles.muted}>Country: South Africa</p>
        {contactMessage && <p>{contactMessage}</p>}
        {contactError && <p className={styles.error}>{contactError}</p>}
        <button className={styles.btn} type="submit" disabled={contactBusy}>
          {contactBusy ? 'Saving…' : 'Save contact details'}
        </button>
      </form>

      <form className={`${styles.panel} ${styles.stack}`} onSubmit={(e) => void onChangePassword(e)}>
        <h2>Change password</h2>
        <label className={styles.field}>
          Current password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          New password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Confirm new password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
        {pwMessage && <p>{pwMessage}</p>}
        {pwError && <p className={styles.error}>{pwError}</p>}
        <button className={styles.btn} type="submit" disabled={pwBusy}>
          {pwBusy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
