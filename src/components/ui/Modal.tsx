import { Fragment, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  showClose?: boolean;
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  full: 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]',
};

export const Modal = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
  showClose = true,
}: ModalProps) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                className={`
                  fixed left-1/2 top-1/2 z-50
                  w-[calc(100%-2rem)] ${sizeStyles[size]}
                  bg-surface border border-primary/20
                  rounded-xl shadow-2xl shadow-primary/10
                  p-6
                  focus:outline-none
                `}
                initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                transition={{ duration: 0.2 }}
              >
                {(title || showClose) && (
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      {title && (
                        <Dialog.Title className="font-display text-xl font-semibold text-text">
                          {title}
                        </Dialog.Title>
                      )}
                      {description && (
                        <Dialog.Description className="text-sm text-text-dim mt-1">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                    {showClose && (
                      <Dialog.Close asChild>
                        <button
                          className="p-1 rounded-lg text-text-dim hover:text-text hover:bg-surface-light transition-colors"
                          aria-label="Close"
                        >
                          <X size={20} />
                        </button>
                      </Dialog.Close>
                    )}
                  </div>
                )}
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
};

// Confirmation modal helper
interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'primary' | 'danger';
}

export const ConfirmModal = ({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'primary',
}: ConfirmModalProps) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} size="sm">
      <p className="text-text-dim mb-6">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={() => onOpenChange(false)}
          className="flex-1 px-4 py-2 rounded-lg bg-surface-light text-text hover:bg-surface-light/80 transition-colors font-medium"
        >
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          className={`
            flex-1 px-4 py-2 rounded-lg font-medium transition-colors
            ${
              variant === 'danger'
                ? 'bg-danger text-white hover:bg-danger/80'
                : 'bg-primary text-background hover:bg-primary-dim'
            }
          `}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
