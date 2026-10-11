import { afterEach, describe, expect, it, vi } from 'vitest';

const configure = vi.fn();
vi.mock('aws-amplify', () => ({ Amplify: { configure } }));

describe('Amplify Cognito initialization', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    configure.mockClear();
  });

  it('configures the v6 singleton once before consumers when required values exist', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'ap-south-1_n684k8sjv');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'existing-client-id');
    const auth = await import('./cognito');
    await import('./cognito');
    expect(auth.cognitoIsConfigured).toBe(true);
    expect(auth.cognitoSelfSignUpEnabled).toBe(false);
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenCalledWith({
      Auth: { Cognito: {
        userPoolId: 'ap-south-1_n684k8sjv',
        userPoolClientId: 'existing-client-id',
        loginWith: { username: true, email: true },
      } },
    });
  });

  it('does not initialize Amplify with incomplete configuration and gives actionable guidance', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'ap-south-1_n684k8sjv');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', '');
    const auth = await import('./cognito');
    expect(auth.cognitoIsConfigured).toBe(false);
    expect(auth.cognitoConfigurationError).toContain('VITE_COGNITO_CLIENT_ID');
    expect(configure).not.toHaveBeenCalled();
  });
});
