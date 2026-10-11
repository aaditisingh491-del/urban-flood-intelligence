
import { Amplify } from 'aws-amplify';

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
export const cognitoConfigurationError = !userPoolId || !userPoolClientId
  ? `Cognito sign-in is not configured. Set ${!userPoolId ? 'VITE_COGNITO_USER_POOL_ID' : ''}${!userPoolId && !userPoolClientId ? ' and ' : ''}${!userPoolClientId ? 'VITE_COGNITO_CLIENT_ID' : ''} in .env.local, then restart the frontend.`
  : null;

export const cognitoIsConfigured = cognitoConfigurationError === null;

// Configure the Amplify v6 singleton synchronously during module evaluation,
// before React renders any code that imports aws-amplify/auth.
if (cognitoIsConfigured) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          username: true,
          email: true,
        },
      },
    },
  });
}
