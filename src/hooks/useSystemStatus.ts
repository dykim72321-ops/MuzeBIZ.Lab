import { useState, useEffect } from 'react';

export const useSystemStatus = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        const res = await fetch('/api/broker/status', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        if (mounted) {
          setIsOnline(res.ok);
          setLastChecked(new Date());
        }
      } catch (err) {
        if (mounted) {
          setIsOnline(false);
          setLastChecked(new Date());
        }
      }
    };

    // Initial check
    checkStatus();

    // Poll every 10 seconds
    const interval = setInterval(checkStatus, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { isOnline, lastChecked };
};
