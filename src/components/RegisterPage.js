// RegisterPage.js
import React, { useState } from 'react';

// --- ADDED: Simple CSS-in-JS for styling (identical to LoginPage) ---
const styles = {
  input: {
    padding: '12px 15px',
    fontSize: '16px',
    width: '100%',
    boxSizing: 'border-box', // Prevents padding from making it wider than 100%
    marginBottom: '15px',
    border: '1px solid #ccc',
    borderRadius: '8px',
  }
};

function RegisterPage({ onRegister, onSwitchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
        const responseMessage = await onRegister({ email, password });
        setMessage(responseMessage || 'Registration successful! Please check your email.');
        setEmail('');
        setPassword('');
    } catch (err) {
      setError(err.message || 'Registration failed.');
    }
  };

  return (
    <div className="container">
      <h2>Register</h2>
      {!message ? (
        <form onSubmit={handleSubmit}>
          {/* --- MODIFIED: Added style prop --- */}
          <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
          <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min. 8 characters)" required />

          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="button">Register</button>
        </form>
      ) : (
        <p className="success-message">{message}</p>
      )}
      <button onClick={onSwitchToLogin} className="button secondary-button">Already have an account? Login</button>
    </div>
  );
}

export default RegisterPage;