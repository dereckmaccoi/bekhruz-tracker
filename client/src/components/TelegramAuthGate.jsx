import { useState, useEffect } from 'react';
import { setInitData } from '../hooks/useApi.js';

export default function TelegramAuthGate({ children }) {
  // 'checking' | 'ok' | 'no_telegram' | 'unauthorized'
  const [status, setStatus] = useState('checking');
  const [errorReason, setErrorReason] = useState('');

  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData;

    if (!initData) {
      setStatus('no_telegram');
      return;
    }

    // Store initData so all subsequent API calls carry the header
    setInitData(initData);

    fetch('/api/auth/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-init-data': initData,
      },
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus('ok');
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorReason(data.error || 'unauthorized');
          setStatus('unauthorized');
        }
      })
      .catch(() => {
        setErrorReason('network_error');
        setStatus('unauthorized');
      });
  }, []);

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-50">
        <p className="text-stone-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (status === 'no_telegram') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-stone-50 p-8 text-center gap-4">
        <span className="text-4xl">📱</span>
        <h1 className="text-xl font-semibold text-stone-800">Open from Telegram</h1>
        <p className="text-stone-500 text-sm max-w-xs">
          This app is designed to run inside Telegram as a Mini App. Please open it from the bot.
        </p>
      </div>
    );
  }

  if (status === 'unauthorized') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-stone-50 p-8 text-center gap-4">
        <span className="text-4xl">🔒</span>
        <h1 className="text-xl font-semibold text-stone-800">Not Authorized</h1>
        <p className="text-stone-500 text-sm max-w-xs">
          {errorReason === 'init_data_expired'
            ? 'Your session expired. Please reopen the app from Telegram.'
            : "You don't have access to this tracker."}
        </p>
      </div>
    );
  }

  return children;
}
