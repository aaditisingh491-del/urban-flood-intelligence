import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthModal from './AuthModal';
import { confirmSignIn, confirmSignUp, fetchUserAttributes, getCurrentUser, signIn, signUp } from 'aws-amplify/auth';

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), confirmSignUp: vi.fn(), confirmSignIn: vi.fn(),
  getCurrentUser: vi.fn(), fetchUserAttributes: vi.fn(),
}));
vi.mock('./cognito', () => ({
  cognitoConfigurationError: null,
  cognitoIsConfigured: true,
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

  it('offers public registration from the existing Cognito pool and confirms before sign-in', async () => {
    vi.mocked(signUp).mockResolvedValueOnce({ isSignUpComplete: false, nextStep: { signUpStep: 'CONFIRM_SIGN_UP' } } as never);
    vi.mocked(confirmSignUp).mockResolvedValueOnce({ isSignUpComplete: true, nextStep: { signUpStep: 'DONE' } } as never);
    vi.mocked(signIn).mockResolvedValueOnce({ isSignedIn: true, nextStep: { signInStep: 'DONE' } } as never);
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ username: 'member_07' } as never);
    vi.mocked(fetchUserAttributes).mockResolvedValueOnce({ given_name: 'Member', email: 'member@example.test' } as never);
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByLabelText('Username / User ID'), { target: { value: 'member_07' } });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Member' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'member@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Valid-password-123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ username: 'member_07', options: expect.objectContaining({ userAttributes: expect.objectContaining({ email: 'member@example.test' }) }) }));
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '246810' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByText(/verified successfully/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Sign in' }).some(button => button.getAttribute('type') === 'submit' && !button.hasAttribute('disabled'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'member@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Valid-password-123!' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' }).find(button => button.getAttribute('type') === 'submit')!);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({ username: 'member_07', firstName: 'Member', email: 'member@example.test' }));
  });

  it('explains when the existing Cognito pool disallows public sign-up', async () => {
    vi.mocked(signUp).mockRejectedValueOnce(Object.assign(new Error('SignUp is not permitted for this user pool'), { name: 'NotAuthorizedException' }));
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByLabelText('Username / User ID'), { target: { value: 'member_07' } });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Member' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'member@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Valid-password-123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/disabled in this Cognito User Pool/i);
  });
});
