import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './App.css';

// Component Imports
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import HomePage from './components/HomePage';
import AccountPage from './components/AccountPage';
import PreviewPage from './components/PreviewPage';
import WaitingPage from './components/WaitingPage';
import ResultsPage from './components/ResultsPage';
import FinalizingPage from './components/FinalizingPage';
import BottomNav from './components/BottomNav';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// --- HELPER FUNCTIONS FOR STATE & ID MANAGEMENT ---

// Simple function to generate a unique ID for anonymous users
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    // FIX: Added parentheses to satisfy the 'no-mixed-operators' ESLint rule.
    // This clarifies the order of operations for bitwise operators.
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
};


// Gets existing anonymous ID or creates a new one and stores it
const getAnonymousId = () => {
  let anonId = localStorage.getItem('anonymousId');
  if (!anonId) {
    anonId = generateUUID();
    localStorage.setItem('anonymousId', anonId);
  }
  return anonId;
};

const saveSnapshot = (flowState, data) => {
  try {
    const snapshot = { flowState, data };
    sessionStorage.setItem('appSnapshot', JSON.stringify(snapshot));
    console.log('[App Snapshot] State saved:', snapshot);
  } catch (e) {
    console.error('[App Snapshot] Failed to save state:', e);
  }
};

const restoreSnapshot = () => {
  try {
    const savedState = sessionStorage.getItem('appSnapshot');
    if (savedState) {
      const parsedState = JSON.parse(savedState);
      console.log('[App Snapshot] State read from session storage:', parsedState);
      return parsedState;
    }
  } catch (e) {
    console.error('[App Snapshot] Failed to restore state:', e);
    sessionStorage.removeItem('appSnapshot');
  }
  return null;
};

function App() {
  const [flowState, setFlowState] = useState('initializing');
  const [currentView, setCurrentView] = useState('home');
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [authView, setAuthView] = useState('login');
  const [aiResponse, setAiResponse] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isUpdatingSubscription, setIsUpdatingSubscription] = useState(false);
  const pollingTimeoutRef = useRef(null);
  const [audioCache, setAudioCache] = useState(new Map());

  const handleLoginSuccess = useCallback((newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  }, []);

  useEffect(() => {
    console.log('[App.js] Mount effect running. Path:', window.location.pathname);
    const urlParams = new URLSearchParams(window.location.search);
    const currentPath = window.location.pathname;

    if (currentPath === '/auth/callback' && urlParams.has('token')) {
        const tokenFromUrl = urlParams.get('token');
        console.log('[App.js] Handling Google Auth callback.');
        handleLoginSuccess(tokenFromUrl);
        window.history.replaceState({}, '', '/');
    }
    else if (urlParams.get('payment') === 'success' && localStorage.getItem('token')) {
        console.log('[App.js] Handling Stripe payment success.');
        setFlowState('finalizing_payment');
        window.history.replaceState({}, '', currentPath);
        return; 
    }

    const restored = restoreSnapshot();
    if (restored?.flowState === 'results') {
        console.log('[App.js] Restoring to Results page from snapshot.');
        setAiResponse(restored.data.aiResponse);
        setFlowState('results');
    } else {
        console.log('[App.js] No results snapshot found. Setting flow to idle.');
        setFlowState(prevState => (prevState === 'initializing' ? 'idle' : prevState));
    }
  }, [handleLoginSuccess]);

  useEffect(() => {
    if (flowState === 'results') {
      setCurrentView('results');
    }
  }, [flowState]);
  
  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // We keep the anonymousId in case they log out and want to continue using the app
    sessionStorage.removeItem('appSnapshot');
    setToken(null);
    setUser(null);
    setCurrentView('home');
    setFlowState('idle');
    setAudioCache(new Map());
  }, []);

  const fetchUserStatus = useCallback(async () => {
    if (!token) {
      setUser(null);
      return null;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Invalid session");
      const data = await response.json();
      setUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      return data.user;
    } catch (error) {
      console.error('Failed to fetch user status:', error.message);
      handleLogout();
      return null;
    }
  }, [token, handleLogout]);

  useEffect(() => {
    if (token) {
      fetchUserStatus();
    }
  }, [token, fetchUserStatus]);

  useEffect(() => {
    if (flowState !== 'finalizing_payment') return;
    let attempts = 0;
    const maxAttempts = 10;
    const pollStatus = async () => {
      attempts++;
      const updatedUser = await fetchUserStatus();
      if (updatedUser && updatedUser.subscriptionStatus === 'active') {
        const restored = restoreSnapshot();
        if (restored?.flowState === 'results') {
          console.log('[App.js] Payment finalized, restoring to Results page.');
          setAiResponse(restored.data.aiResponse);
          setFlowState('results');
        } else {
          console.log('[App.js] Payment finalized, going to Account page.');
          setFlowState('idle');
          setCurrentView('account');
        }
      } else if (attempts < maxAttempts) {
        pollingTimeoutRef.current = setTimeout(pollStatus, 2000);
      } else {
        setErrorMessage("Payment confirmed, but account activation is delayed.");
        setFlowState('error');
      }
    };
    pollStatus();
    return () => clearTimeout(pollingTimeoutRef.current);
  }, [flowState, fetchUserStatus]);

  const handleSubscribe = async () => {
    let returnPath = '/account';
    if (flowState === 'results' && aiResponse) {
      saveSnapshot('results', { aiResponse });
      returnPath = '/';
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/payment/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ returnPath }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.message || 'Could not create checkout session.');
      }
    } catch (error) {
      setErrorMessage(error.message);
      setFlowState('error');
    }
  };

  const requestLogin = () => {
    if (flowState === 'results' && aiResponse) {
      saveSnapshot('results', { aiResponse });
    }
    setFlowState('login_request');
    setAuthView('login');
  };

  const handleCloseLogin = () => {
    const restored = restoreSnapshot();
    if (restored?.flowState === 'results') {
        setFlowState('results');
        return;
    }
    setFlowState('idle');
  };

  const handleLoginAttempt = async (credentials) => {
    const response = await fetch(`${BACKEND_URL}/api/login/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    handleLoginSuccess(data.token);
    const restored = restoreSnapshot();
    setFlowState(restored?.flowState || 'idle');
    if (!restored) {
      setCurrentView('account');
    }
  };
  
  const handleRegisterAttempt = async (credentials) => {
    const response = await fetch(`${BACKEND_URL}/api/login/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    setAuthView('login');
  };

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setPreviewUrl(reader.result);
        reader.readAsDataURL(file);
    } else {
        setPreviewUrl(null);
    }
    setFlowState('preview');
  };

  const handleUploadConfirm = async () => {
    setFlowState('waiting');
    const formData = new FormData();
    formData.append('homeworkImage', selectedFile);

    // Add anonymous ID if user is not logged in
    if (!token) {
      const anonymousId = getAnonymousId();
      formData.append('anonymousId', anonymousId);
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/process-homework`, {
        method: 'POST', 
        body: formData, 
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      const newResponse = { reply1: data.reply1, reply2: data.reply2 };
      setAiResponse(newResponse);
      saveSnapshot('results', { aiResponse: newResponse });
      setAudioCache(new Map());
      setFlowState('results');
    } catch (error) {
      setErrorMessage(`Upload failed: ${error.message}`);
      setFlowState('error');
    }
  };
  
  const handleSubscriptionAction = async (actionPromise) => {
    setIsUpdatingSubscription(true);
    try {
      await actionPromise();
      await fetchUserStatus();
    } catch (error) {
      setErrorMessage(error.message || "An error occurred.");
      setFlowState('error');
    } finally {
      setIsUpdatingSubscription(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm("Are you sure?")) return;
    const apiCall = () => fetch(`${BACKEND_URL}/api/payment/cancel-subscription`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => { if (!res.ok) throw new Error('Failed to cancel')});
    handleSubscriptionAction(apiCall);
  };

  const handleReactivateSubscription = async () => {
    const apiCall = () => fetch(`${BACKEND_URL}/api/payment/reactivate-subscription`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => { if (!res.ok) throw new Error('Failed to reactivate')});
    handleSubscriptionAction(apiCall);
  };
  
  const resetAppFlow = () => {
    sessionStorage.removeItem('appSnapshot');
    setFlowState('idle');
    setCurrentView('home');
    setSelectedFile(null);
    setPreviewUrl(null);
    setAiResponse(null);
    setErrorMessage('');
    setAudioCache(new Map());
  };
  
  const handleNavClick = (view) => {
    if (view === 'account' && !user) {
      requestLogin();
      return; 
    }

    if (view === 'results') {
      setFlowState('results');
      setCurrentView('results');
    } else {
      setFlowState('idle');
      setCurrentView(view);
    }
  };

  const renderLoginModal = () => {
    if (flowState !== 'login_request') return null;
    return (
      <div className="login-overlay" onClick={handleCloseLogin}>
        <div className="login-modal-content" onClick={e => e.stopPropagation()}>
           <button className="close-modal-button" onClick={handleCloseLogin}>×</button>
           {authView === 'login' ? (
              <LoginPage onLogin={handleLoginAttempt} onSwitchToRegister={() => setAuthView('register')} />
           ) : (
              <RegisterPage onRegister={handleRegisterAttempt} onSwitchToLogin={() => setAuthView('login')} />
           )}
        </div>
      </div>
    );
  };

  const renderAppContent = () => {
    const showBottomNav = flowState === 'idle' || flowState === 'results';

    if (flowState === 'results' || (flowState === 'login_request' && aiResponse)) {
      return <ResultsPage 
        response={aiResponse} 
        backendUrl={BACKEND_URL} 
        user={user} 
        token={token} 
        onRequestLogin={requestLogin} 
        onSubscribe={handleSubscribe} 
        audioCache={audioCache}
        setAudioCache={setAudioCache}
        isBottomNavVisible={showBottomNav}
      />;
    }

    switch (flowState) {
      case 'initializing':
        return <div className="spinner"></div>;
      case 'finalizing_payment':
        return <FinalizingPage />;
      case 'error':
        return (
          <div className="container error-container">
            <h2>Something went wrong!</h2>
            <p className="error-message">{errorMessage}</p>
            <button onClick={resetAppFlow} className="button">Back to Home</button>
          </div>
        );
      case 'preview':
        return <PreviewPage file={selectedFile} previewUrl={previewUrl} onConfirm={handleUploadConfirm} onBack={() => setFlowState('idle')} />;
      case 'waiting':
        return <WaitingPage file={selectedFile} previewUrl={previewUrl} />;
      case 'idle':
      case 'login_request':
      default:
        switch (currentView) {
          case 'account':
            return user ? <AccountPage 
              user={user} 
              isUpdatingSubscription={isUpdatingSubscription} 
              onLogout={handleLogout} 
              onSubscribe={handleSubscribe} 
              onCancelSubscription={handleCancelSubscription}
              onReactivateSubscription={handleReactivateSubscription}
            /> : null;
          case 'home':
          default:
            return <HomePage onFileSelect={handleFileSelect} />;
        }
    }
  };

  const showBottomNav = flowState === 'idle' || flowState === 'results';

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="App">
        <div className="app-layout">
          <main className="main-content">
            {renderAppContent()}
          </main>
          {showBottomNav && 
            <BottomNav 
              activeView={currentView} 
              onNavClick={handleNavClick} 
              user={user} 
              hasResults={!!aiResponse}
            />
          }
        </div>
        {renderLoginModal()}
      </div>
    </GoogleOAuthProvider>
  );
};

export default App;