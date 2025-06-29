import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

// A custom button component to trigger the server-side flow
const GoogleLoginButton = () => {
  const handleGoogleLogin = () => {
    // Redirect the user to our backend endpoint that starts the Google OAuth flow
    window.location.href = `${BACKEND_URL}/api/login/auth/google`;
  };

  return (
    <button onClick={handleGoogleLogin} className="button google-button">
      <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google logo" />
      Sign in with Google
    </button>
  );
};


function LoginPage({ onLogin, onSwitchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Check for login errors from URL params (e.g., from Google auth failure)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
      setError('Google Sign-In failed. Please try again or use a different method.');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onLogin({ email, password });
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="button">Login</button>
      </form>
      
      <div className="divider">OR</div>
      
      <GoogleLoginButton />
      
      <button onClick={onSwitchToRegister} className="button secondary-button">Need an account? Register</button>
    </div>
  );
}
export default LoginPage;