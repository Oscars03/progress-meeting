import Landing from '../landing';

/**
 * Where the app sends anybody signed out, and where NextAuth returns a failed
 * or pending sign-in (?error=, ?pending= -- read by the form itself). The same
 * page as `/`, lab mark and name included, rather than the form alone.
 */
export default function LoginPage() {
  return <Landing />;
}
