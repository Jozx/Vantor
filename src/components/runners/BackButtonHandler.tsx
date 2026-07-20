import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PluginListenerHandle } from '@capacitor/core';

export default function BackButtonHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    let handler: PluginListenerHandle | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        handler = await App.addListener('backButton', ({ canGoBack }) => {
          if (pathRef.current === '/') {
            if (!canGoBack) App.exitApp();
          } else {
            navigate('/');
          }
        });
      } catch {
        // Not running in Capacitor (browser dev) — ignore
      }
    })();

    return () => {
      handler?.remove();
    };
  }, [navigate]);

  return null;
}
