// RegisterPage.js
import React, { useState } from 'react';

function RegisterPage({ onRegister, onSwitchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    // --- ADDED: Frontend Password Validation ---
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
        // The onRegister function now gets the success message from the backend
        const responseMessage = await onRegister({ email, password });
        setMessage(responseMessage || 'Registration successful! Please check your email.');
        // Clear form on success
        setEmail('');
        setPassword('');
    } catch (err) {
      setError(err.message || 'Registration failed.');
    }
  };

  return (
    <div className="container">
      <h2>Register</h2>
      {/* Hide form if registration was successful */}
      {!message ? (
        <form onSubmit={handleSubmit}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min. 8 characters)" required />
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