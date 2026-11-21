// Google account row on the Saved tab: sign in / signed-in email, open the sheet, sign out.
import { useState } from 'react';
import { CircleUserRound, ExternalLink, LogIn, LogOut } from 'lucide-react';
import { signIn, signOut, useGoogleAccount } from '../lib/googleSheets.js';
import { useT } from '../lib/i18n.js';

export default function GoogleAccountBar({ busy, onToast }) {
  const { t } = useT();
  const account = useGoogleAccount();
  const [signingIn, setSigningIn] = useState(false);

  async function doSignIn() {
    setSigningIn(true);
    try {
      const email = await signIn();
      onToast({ text: t('gSignedIn', { email }), kind: 'ok' });
    } catch (e) {
      onToast({ text: t('errorMsg', { msg: e.message }), kind: 'err' });
    } finally {
      setSigningIn(false);
    }
  }

  function doSignOut() {
    if (!confirm(t('gConfirmSignOut', { email: account.email }))) return;
    signOut();
    onToast({ text: t('gSignedOut'), kind: 'ok' });
  }

  return (
    <div className="card account-bar">
      <span className="account-who" title={t('gAccount')}>
        <CircleUserRound size={18} aria-hidden="true" />
        {account.signedIn ? <strong>{account.email}</strong> : <span className="muted small">{t('gNotSignedIn')}</span>}
      </span>
      <div className="list-bar-actions">
        {account.signedIn ? (
          <>
            {account.sheetUrl && (
              <a className="button small-btn" href={account.sheetUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> {t('gOpenSheet')}
              </a>
            )}
            <button className="small-btn" disabled={busy} onClick={doSignOut}>
              <LogOut size={16} /> {t('gSignOut')}
            </button>
          </>
        ) : (
          <button className="primary small-btn" disabled={busy || signingIn} onClick={doSignIn}>
            {signingIn ? <span className="spinner" aria-hidden="true" /> : <LogIn size={16} />} {t('gSignIn')}
          </button>
        )}
      </div>
    </div>
  );
}
