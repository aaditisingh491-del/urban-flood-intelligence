import './cognito';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';
import AuthModal from './AuthModal';
import { getAuthReturnPath } from './authNavigation';
import { cognitoIsConfigured } from './cognito';

type AppUser = { username: string; firstName: string; email: string };

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  useEffect(() => {
    let active = true;
    if (cognitoIsConfigured) {
      void getCurrentUser().then(async (user) => {
        const attributes = await fetchUserAttributes();
        if (active) setCurrentUser({
          username: user.username,
          firstName: attributes.given_name || user.username,
          email: attributes.email || '',
        });
      }).catch(() => { if (active) setCurrentUser(null); });
    }
    return () => { active = false; };
  }, []);

  const returnTo = getAuthReturnPath(location.state);
  const close = () => returnTo ? navigate(-1) : navigate('/', { replace: true });
  return <AuthModal
    onClose={close}
    userEmail={currentUser?.email || null}
    onSignedIn={user => { setCurrentUser(user); close(); }}
    onSignedOut={() => setCurrentUser(null)}
  />;
}
