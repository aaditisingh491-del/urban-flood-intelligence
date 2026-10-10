
import { Amplify } from 'aws-amplify';

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

if (!userPoolId || !userPoolClientId) {
  console.error('Cognito configuration is missing. Check .env.local.');
} else {
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
