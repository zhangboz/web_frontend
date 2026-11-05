import { useCallback, useEffect, useRef, useState } from 'react';
import { SUBSCRIPTION_UNAVAILABLE, withoutVerifiedSubscription } from '../utils/subscription';

export default function useUserStatus({ token, backendUrl, onUnauthorized, accountVisible = false, fetchImpl = fetch }) {
  const [user, setUser] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(null);
  const tokenRef = useRef(token);
  const userTokenRef = useRef(token);
  const mountedRef = useRef(false);
  tokenRef.current = token;
  const currentUser = userTokenRef.current === token ? user : null;

  useEffect(() => {
    mountedRef.current = true;
    if (userTokenRef.current !== token) localStorage.removeItem('user');
    userTokenRef.current = token;
    setUser(null);
    setError('');
    setIsRefreshing(false);
    return () => {
      mountedRef.current = false;
      clearTimeout(requestRef.current?.timer);
      requestRef.current?.controller.abort();
      requestRef.current = null;
    };
  }, [token]);

  const refresh = useCallback(() => {
    if (!token) return Promise.resolve(null);
    if (requestRef.current?.token === token) return requestRef.current.promise;
    const entry = { token, controller: new AbortController() };
    requestRef.current = entry;
    setIsRefreshing(true);
    setError('');
    setUser(previous => withoutVerifiedSubscription(previous));
    const isCurrent = () => mountedRef.current && tokenRef.current === token && requestRef.current === entry;
    entry.timer = setTimeout(() => entry.controller.abort(), 90_000);
    entry.promise = (async () => {
      try {
        const response = await fetchImpl(`${backendUrl}/api/user/status`, {
          headers: { Authorization: `Bearer ${token}` }, signal: entry.controller.signal,
        });
        if (!isCurrent()) return null;
        if (response.status === 401) {
          onUnauthorized();
          return null;
        }
        if (!response.ok) throw new Error('Status unavailable');
        const data = await response.json();
        if (!isCurrent()) return null;
        if (!data.user?.id || data.user.subscriptionSource !== 'stripe') throw new Error('Invalid status response');
        setUser(data.user);
        return data.user;
      } catch {
        if (isCurrent()) {
          setUser(previous => withoutVerifiedSubscription(previous));
          setError(SUBSCRIPTION_UNAVAILABLE);
        }
        return null;
      } finally {
        clearTimeout(entry.timer);
        if (isCurrent()) {
          requestRef.current = null;
          setIsRefreshing(false);
        }
      }
    })();
    return entry.promise;
  }, [token, backendUrl, onUnauthorized, fetchImpl]);

  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  useEffect(() => {
    if (token && accountVisible) void refresh();
  }, [token, accountVisible, refresh]);

  useEffect(() => {
    if (!token) return undefined;
    let lastForegroundRefresh = 0;
    const foreground = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastForegroundRefresh < 1000) return;
      lastForegroundRefresh = Date.now();
      void refresh();
    };
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [token, refresh]);

  useEffect(() => {
    if (currentUser) localStorage.setItem('user', JSON.stringify(currentUser));
    else if (!token || error) localStorage.removeItem('user');
  }, [currentUser, token, error]);

  return { user: currentUser, isRefreshing, error, refresh };
}
