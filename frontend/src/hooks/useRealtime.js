import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';

/**
 * Listen for conversion lifecycle events:
 *   conversion:started, conversion:progress, conversion:completed, conversion:failed
 *
 * @param {function} callback - Called with (eventName, data) on every conversion event.
 */
export const useConversionUpdates = (callback) => {
  const { socket, isConnected, updateLastEvent } = useSocket();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!socket || !isConnected) return;

    const events = [
      'conversion:started',
      'conversion:progress',
      'conversion:completed',
      'conversion:failed',
    ];

    const handlers = events.map((event) => {
      const handler = (data) => {
        updateLastEvent(event, data);
        callbackRef.current?.(event, data);
      };
      socket.on(event, handler);
      return { event, handler };
    });

    return () => {
      handlers.forEach(({ event, handler }) => socket.off(event, handler));
    };
  }, [socket, isConnected, updateLastEvent]);
};

/**
 * Listen for file deletion events:
 *   file:deleted
 *
 * @param {function} callback - Called with (eventName, data) on file events.
 */
export const useFileUpdates = (callback) => {
  const { socket, isConnected, updateLastEvent } = useSocket();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handler = (data) => {
      updateLastEvent('file:deleted', data);
      callbackRef.current?.('file:deleted', data);
    };

    socket.on('file:deleted', handler);
    return () => socket.off('file:deleted', handler);
  }, [socket, isConnected, updateLastEvent]);
};

/**
 * Listen for system health events (admin only):
 *   system:health
 *
 * @param {function} callback - Called with (eventName, data) on system events.
 */
export const useSystemAlerts = (callback) => {
  const { socket, isConnected, updateLastEvent } = useSocket();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handler = (data) => {
      updateLastEvent('system:health', data);
      callbackRef.current?.('system:health', data);
    };

    socket.on('system:health', handler);
    return () => socket.off('system:health', handler);
  }, [socket, isConnected, updateLastEvent]);
};

/**
 * Main hook that provides connection status and the last received event.
 */
export const useRealtime = () => {
  const { isConnected, lastEvent } = useSocket();
  return { isConnected, lastEvent };
};

export default useRealtime;
