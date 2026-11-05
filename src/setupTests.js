// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// CRA's jsdom version predates Web Crypto; production browsers provide this API.
Object.defineProperty(globalThis, 'crypto', { value: require('crypto').webcrypto, configurable: true });
