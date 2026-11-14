import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmarProvider } from './context/ConfirmarContext';
import { iniciarAnalitica } from './lib/analitica';
import './index.css';

iniciarAnalitica();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmarProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmarProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
