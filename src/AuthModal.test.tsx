import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthModal from './AuthModal';
import { confirmSignIn, fetchUserAttributes, getCurrentUser, signIn } from 'aws-amplify/auth';

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), confirmSignUp: vi.fn(), confirmSignIn: vi.fn(),
  getCurrentUser: vi.fn(), fetchUserAttributes: vi.fn(),
}));
vi.mock('./cognito', () => ({
  cognitoConfigurationError: null,
  cognitoIsConfigured: true,
  cognitoSelfSignUpEnabled: false,
}));

const onClose = vi.fn();
const onSignedIn = vi.fn();
const onSignedOut = vi.fn();

function renderLogin() {
  return render(<AuthModal onClose={onClose} userEmail={null} onSignedIn={onSignedIn} onSignedOut={onSignedOut} />);
}

afterEach(() => {
  cleanup(); vi.clearAllMocks();
});

describe('Cognito direct Auth sign-in', () => {
  it('reports a Cognito sign-in error accessibly and does not navigate', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(Object.assign(new Error('Invalid login'), { name: 'NotAuthorizedException' }));
    renderLogin();
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'member@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-a-real-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/username, email, or password is incorrect/i);
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('handles a successful direct Auth result once and leaves navigation to its caller', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ isSignedIn: true, nextStep: { signInStep: 'DONE' } } as never);
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ username: 'member' } as never);
    vi.mocked(fetchUserAttributes).mockResolvedValueOnce({ given_name: 'Member', email: 'member@example.test' } as never);
    renderLogin();
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'member@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-a-real-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({ username: 'member', firstName: 'Member', email: 'member@example.test' }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('completes a Cognito verification challenge before invoking the signed-in callback', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_SMS_CODE' } } as never);
    vi.mocked(confirmSignIn).mockResolvedValueOnce({ isSignedIn: true, nextStep: { signInStep: 'DONE' } } as never);
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ username: 'member' } as never);
    vi.mocked(fetchUserAttributes).mockResolvedValueOnce({ email: 'member@example.test' } as never);
    renderLogin();
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'member@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-a-real-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Complete sign-in verification' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(confirmSignIn).toHaveBeenCalledWith({ challengeResponse: '123456' }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not offer self-registration unless explicitly enabled for the existing pool', () => {
    renderLogin();
    expect(screen.queryByRole('button', { name: 'Create an account' })).not.toBeInTheDocument();
    expect(screen.getByText('Self-registration is not enabled for this app.')).toBeInTheDocument();
  });
});
