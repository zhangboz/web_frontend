import React from 'react';
import './BottomNav.css';
import { ReactComponent as LogoIcon } from '../assets/logo.svg';

// --- SVG Icons (no changes here) ---
const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
);

const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
);

const ResultsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
);

function BottomNav({ activeView, onNavClick, user, hasResults }) {
  return (
    <nav className="bottom-nav">
      {/* --- MODIFIED: Added a span for the text --- */}
      <div className="nav-title">
        <LogoIcon className="nav-logo-icon" />
        <span className="nav-logo-text">Synapse-Education</span>
      </div>

      <div className="nav-items-container">
        <button
          className={`nav-item ${activeView === 'home' ? 'active' : ''}`}
          onClick={() => onNavClick('home')}
        >
          <HomeIcon />
          <span>Home</span>
        </button>

        {hasResults && (
          <button
            className={`nav-item ${activeView === 'results' ? 'active' : ''}`}
            onClick={() => onNavClick('results')}
          >
            <ResultsIcon />
            <span>Results</span>
          </button>
        )}

        <button
          className={`nav-item ${activeView === 'account' ? 'active' : ''}`}
          onClick={() => onNavClick('account')}
        >
          <UserIcon />
          <span>{user ? 'Account' : 'Login'}</span>
        </button>
      </div>
    </nav>
  );
}

export default BottomNav;