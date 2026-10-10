
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  getCurrentUser,
  fetchUserAttributes,
} from 'aws-amplify/auth';

type AuthModalProps = {
  onClose: () => void;
  userEmail: string | null;
  onSignedIn: (user: {
    username: string;
    firstName: string;
    email: string;
  }) => void;
  onSignedOut: () => void;
};

type Mode = 'login' | 'signup' | 'confirm';

export default function AuthModal({
  onClose,
  userEmail,
  onSignedIn,
  onSignedOut,
}: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(
    userEmail ? 'login' : 'login'
  );

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const clearMessages = () => {
    setMessage('');
    setError('');
  };

  const getFriendlyError = (err: unknown) => {
    if (err instanceof Error) {
      switch (err.name) {
        case 'UsernameExistsException':
          return 'This username or email is already registered. Please sign in or use different details.';
        case 'InvalidPasswordException':
          return 'Your password does not meet the required password policy.';
        case 'CodeMismatchException':
          return 'The verification code is incorrect. Please check the code and try again.';
        case 'ExpiredCodeException':
          return 'The verification code has expired. Please request a new code.';
        case 'NotAuthorizedException':
          return 'The username, email, or password is incorrect, or the account is not ready to sign in.';
        case 'UserNotConfirmedException':
          return 'Your account has not been verified yet. Please verify your email address.';
        case 'LimitExceededException':
        case 'TooManyRequestsException':
          return 'Too many attempts were made. Please wait a while and try again.';
        default:
          return err.message || 'Something went wrong. Please try again.';
      }
    }

    return 'Something went wrong. Please try again.';
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();
    setBusy(true);

    try {
      if (mode === 'signup') {
        const cleanUsername = username.trim();
        const cleanFirstName = firstName.trim();
        const cleanEmail = email.trim();

        if (!cleanUsername || !cleanFirstName || !cleanEmail) {
          setError('Please complete all required fields.');
          return;
        }

        const result = await signUp({
          username: cleanUsername,
          password,
          options: {
            userAttributes: {
              email: cleanEmail,
              given_name: cleanFirstName,
            },
          },
        });

        if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
          setMode('confirm');
          setMessage(
            'Your account has been created. A verification code has been sent to your email address. Please check your inbox and spam folder.'
          );
        } else {
          setMessage(
            'Your account has been created. You can now sign in.'
          );
          setMode('login');
        }
      } else if (mode === 'confirm') {
        const result = await confirmSignUp({
          username: username.trim(),
          confirmationCode: code.trim(),
        });

        if (result.isSignUpComplete) {
          setMessage(
            'Your email address has been verified successfully. You can now sign in using your username or email and password.'
          );
          setMode('login');
        } else {
          setMessage(
            'Your confirmation request was submitted. Follow the next verification step to continue.'
          );
        }
      } else {
        const result = await signIn({
          username: email.trim(),
          password,
        });

        if (result.isSignedIn) {
          const user = await getCurrentUser();
          const attributes = await fetchUserAttributes();

          onSignedIn({
            username: user.username,
            firstName: attributes.given_name || user.username,
            email: attributes.email || email.trim(),
          });

          onClose();
        } else if (
          result.nextStep.signInStep === 'CONFIRM_SIGN_UP'
        ) {
          setUsername(email.trim());
          setMode('confirm');
          setMessage(
            'Your email address has not been verified. Enter the verification code sent to your email address.'
          );
        } else {
          setMessage(
            'Additional verification is required to complete sign-in. Please follow the instructions provided.'
          );
        }
      }
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    clearMessages();
    setBusy(true);

    try {
      await signOut();
      onSignedOut();
      onClose();
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const isLoggedIn = Boolean(userEmail);

  return (
    <div className="auth-overlay" onClick={onClose}>
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="auth-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        {isLoggedIn ? (
          <>
            <p className="auth-eyebrow">ACCOUNT</p>
            <h2 id="auth-title">Your account</h2>
            <p className="auth-description">
              You are signed in as {userEmail}.
            </p>

            {error && <p className="auth-error">{error}</p>}

            <button
              type="button"
              className="auth-submit"
              disabled={busy}
              onClick={handleSignOut}
            >
              {busy ? 'Signing out...' : 'Sign out'}
            </button>
          </>
        ) : (
          <>
            <p className="auth-eyebrow">FLOOD INTELLIGENCE PLATFORM</p>

            <h2 id="auth-title">
              {mode === 'signup'
                ? 'Create your account'
                : mode === 'confirm'
                  ? 'Verify your email'
                  : 'Sign in'}
            </h2>

            <p className="auth-description">
              {mode === 'signup'
                ? 'Create an account to access your dashboard.'
                : mode === 'confirm'
                  ? 'Enter the verification code sent to your email address.'
                  : 'Use your username or email and password to continue.'}
            </p>

            {message && (
              <p className="auth-message" role="status">
                {message}
              </p>
            )}

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <form onSubmit={submit}>
              {mode === 'signup' && (
                <>
                  <label htmlFor="auth-username">Username / User ID</label>
                  <input
                    id="auth-username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="e.g. ashika_07"
                    minLength={3}
                    maxLength={40}
                    pattern="[a-zA-Z0-9_-]+"
                    title="Use letters, numbers, underscores, or hyphens."
                    required
                  />

                  <label htmlFor="auth-firstname">First name</label>
                  <input
                    id="auth-firstname"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="Enter your first name"
                    required
                  />
                </>
              )}

              {mode === 'login' && (
                <>
                  <label htmlFor="auth-email">Username or email</label>
                  <input
                    id="auth-email"
                    type="text"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Enter your username or email"
                    required
                  />
                </>
              )}

              {mode === 'signup' && (
                <>
                  <label htmlFor="auth-email">Email address</label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </>
              )}

              {mode !== 'confirm' && (
                <>
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={
                      mode === 'signup'
                        ? 'new-password'
                        : 'current-password'
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={
                      mode === 'signup'
                        ? 'Create a password'
                        : 'Enter your password'
                    }
                    minLength={8}
                    required
                  />
                </>
              )}

              {mode === 'confirm' && (
                <>
                  <label htmlFor="auth-code">Verification code</label>
                  <input
                    id="auth-code"
                    type="text"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Enter the code from your email"
                    required
                  />
                </>
              )}

              <button
                type="submit"
                className="auth-submit"
                disabled={busy}
              >
                {busy
                  ? 'Please wait...'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'confirm'
                      ? 'Verify email'
                      : 'Sign in'}
              </button>
            </form>

            <div className="auth-switch">
              {mode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setMode('login');
                    }}
                  >
                    Sign in
                  </button>
                </>
              ) : mode === 'confirm' ? (
                <>
                  Already verified?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setMode('login');
                    }}
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  New to the platform?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setMode('signup');
                    }}
                  >
                    Create an account
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
