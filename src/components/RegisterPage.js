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
    try {
        await onRegister({ email, password });
        setMessage('Registration successful! Please log in.');
    } catch (err) {
      setError(err.message || 'Registration failed.');
    }
  };

  return (
    <div className="container">
      <h2>Register</h2>
      <form onSubmit={handleSubmit}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
        {error && <p className="error-message">{error}</p>}
        {message && <p className="success-message">{message}</p>}
        <button type="submit" className="button">Register</button>
      </form>
      <button onClick={onSwitchToLogin} className="button secondary-button">Already have an account? Login</button>
    </div>
  );
}

export default RegisterPage;