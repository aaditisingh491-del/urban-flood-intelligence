import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import SignInPage from './SignInPage';
import { getAuthReturnPath } from './authNavigation';

describe('Cognito sign-in navigation', () => {
  afterEach(() => cleanup());
  it('returns only to a safe internal path and falls back home for direct visits', () => {
    expect(getAuthReturnPath({ from: '/explore?search=lake' })).toBe('/explore?search=lake');
    expect(getAuthReturnPath({ from: '//outside.example' })).toBeNull();
    expect(getAuthReturnPath({ from: '/signin' })).toBeNull();
    expect(getAuthReturnPath(null)).toBeNull();
  });

  it('supports configured direct sign-in route loading and Back without Amplify UI context', () => {
    render(<MemoryRouter initialEntries={['/signin']}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/" element={<p>FloodSense home</p>} />
      </Routes>
    </MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create an account' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('FloodSense home')).toBeInTheDocument();
  });

  it('uses browser history for Back and Forward when opened from the app', () => {
    const Home = () => {
      const navigate = useNavigate();
      return <button onClick={() => navigate(1)}>Browser Forward</button>;
    };
    render(<MemoryRouter initialEntries={[{ pathname: '/' }, { pathname: '/signin', state: { from: '/' } }]} initialIndex={1}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/" element={<><p>FloodSense home</p><Home /></>} />
      </Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('FloodSense home')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Browser Forward' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
