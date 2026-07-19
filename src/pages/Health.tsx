import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDb } from '@/db';
import { Capacitor } from '@capacitor/core';
import { SQLiteConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Database, ShieldCheck, ShieldAlert, Lock, Unlock, ArrowLeft, RefreshCw } from 'lucide-react';

export default function Health() {
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [platform, setPlatform] = useState<string>('');
  const [encrypted, setEncrypted] = useState<boolean | null>(null);

  const checkConnection = async () => {
    setStatus('loading');
    setErrorMsg('');
    setEncrypted(null);
    try {
      const p = Capacitor.getPlatform();
      setPlatform(p);
      const db = await getDb();
      if (db) {
        setStatus('connected');
        if (p !== 'web') {
          const conn = new SQLiteConnection(CapacitorSQLite);
          const enc = (await conn.isDatabaseEncrypted('finance.db')).result;
          setEncrypted(enc ?? false);
        } else {
          setEncrypted(false);
        }
      } else {
        throw new Error('Database instance is null');
      }
    } catch (err: unknown) {
      console.error(err);
      setStatus('error');
      const message = err instanceof Error ? err.message : 'Unknown database connection error';
      setErrorMsg(message);
    }
  };

  useEffect(() => {
    let active = true;
    const init = async () => {
      await Promise.resolve(); // run on next microtask
      if (active) {
        await checkConnection();
      }
    };
    init();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-2xl p-8 transition-all duration-300">
        <div className="flex flex-col items-center text-center">
          {/* Logo / Header */}
          <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-2xl mb-4 text-zinc-900 dark:text-zinc-50">
            <Database className="h-8 w-8 animate-pulse text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
            Vantor Health
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">
            Database Connectivity Verification Scaffolding
          </p>

          {/* Connection Status Box */}
          <div className="w-full rounded-xl p-6 mb-8 transition-all duration-300 bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-900">
            {status === 'loading' && (
              <div className="flex flex-col items-center justify-center py-4">
                <RefreshCw className="h-8 w-8 animate-spin text-zinc-400 mb-3" />
                <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                  Initializing SQLite Connection...
                </span>
                <span className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">
                  Detecting platform and loading WASM assets if web
                </span>
              </div>
            )}

            {status === 'connected' && (
              <div className="flex flex-col items-center justify-center py-4">
                <div className="p-2 bg-emerald-500/10 rounded-full mb-3">
                  <ShieldCheck className="h-10 w-10 text-emerald-500" />
                </div>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xl mb-1">
                  DB connected
                </span>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400/80 border border-emerald-200/30">
                  finance.db is active
                </div>
                <div className="text-zinc-500 dark:text-zinc-400 text-xs mt-4 flex flex-col gap-1 items-center">
                  <span>
                    Platform:{' '}
                    <strong className="text-zinc-700 dark:text-zinc-300 capitalize">
                      {platform}
                    </strong>
                  </span>
                  <span>
                    Store: {platform === 'web' ? 'IndexedDB (jeep-sqlite)' : 'Native SQLite'}
                  </span>
                  {encrypted !== null && (
                    <span className="flex items-center gap-1 mt-1">
                      {encrypted ? (
                        <>
                          <Lock className="h-3 w-3 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            SQLCipher 256-bit AES encryption active
                          </span>
                        </>
                      ) : (
                        <>
                          <Unlock className="h-3 w-3 text-amber-500" />
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            Unencrypted — browser mode does not support SQLCipher
                          </span>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center justify-center py-4">
                <div className="p-2 bg-rose-500/10 rounded-full mb-3">
                  <ShieldAlert className="h-10 w-10 text-rose-500" />
                </div>
                <span className="text-rose-600 dark:text-rose-400 font-bold text-xl mb-1">
                  Connection Failed
                </span>
                <div className="w-full mt-3 p-3 bg-rose-500/5 dark:bg-rose-950/10 border border-rose-500/20 rounded-lg text-left">
                  <p className="text-rose-600 dark:text-rose-400 text-xs break-all leading-relaxed">
                    {errorMsg}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={checkConnection}
              disabled={status === 'loading'}
              className="flex-1 gap-2 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Check
            </Button>
            <Link
              to="/"
              className={cn(
                buttonVariants({ variant: 'default' }),
                'flex-1 gap-2 bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200'
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
