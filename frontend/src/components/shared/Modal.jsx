import { useEffect, useRef, useCallback, useState } from 'react';
import { X } from 'lucide-react';

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

function Modal({ isOpen, onClose, title, size = 'md', children, footer }) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setAnimating(true);
      // Small delay to trigger CSS transition
      const timer = requestAnimationFrame(() => {
        setVisible(true);
      });
      return () => cancelAnimationFrame(timer);
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setAnimating(false);
        // Restore focus
        if (previousFocusRef.current && previousFocusRef.current.focus) {
          previousFocusRef.current.focus();
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Focus first focusable element when opened
  useEffect(() => {
    if (isOpen && visible && contentRef.current) {
      const timer = setTimeout(() => {
        const focusable = contentRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, visible]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trapping
  useEffect(() => {
    if (!isOpen || !contentRef.current) return;

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      const focusable = contentRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen && !animating) return null;

  const widthClass = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className={`
        fixed inset-0 z-50 flex items-center justify-center p-4
        transition-all duration-200
        ${visible ? 'bg-black/50' : 'bg-black/0'}
      `}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={contentRef}
        className={`
          relative w-full ${widthClass} bg-white rounded-xl shadow-xl
          transition-all duration-200 transform
          ${visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}
        `}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200">
            <h2 id="modal-title" className="text-lg font-semibold text-secondary-900">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-secondary-400 hover:text-secondary-600 hover:bg-secondary-100 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className={`px-6 py-4 overflow-y-auto max-h-[calc(100vh-12rem)] ${!title ? 'pt-6' : ''}`}>
          {!title && (
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-secondary-400 hover:text-secondary-600 hover:bg-secondary-100 transition-colors z-10"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-secondary-200 bg-secondary-50 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
