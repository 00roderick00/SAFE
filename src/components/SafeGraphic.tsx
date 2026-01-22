// Safe Graphic Component - Shows your vault with balance inside
import { motion } from 'framer-motion';

interface SafeGraphicProps {
  size?: number;
  isVulnerable?: boolean;
  isBeingAttacked?: boolean;
  balance?: number;
}

// Format balance for display inside safe
const formatBalance = (amount: number): string => {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
};

export const SafeGraphic = ({
  size = 200,
  isVulnerable = false,
  isBeingAttacked = false,
  balance
}: SafeGraphicProps) => {
  const accentColor = isVulnerable ? '#FF5000' : '#D7FF5D';
  const bgColor = isVulnerable ? '#1a1212' : '#121212';

  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={isBeingAttacked ? { x: [0, -2, 2, -2, 2, 0] } : {}}
      transition={{ duration: 0.5, repeat: isBeingAttacked ? Infinity : 0, repeatDelay: 0.5 }}
    >
      <svg viewBox="0 0 200 200" width={size} height={size}>
        {/* Safe body shadow */}
        <rect x="25" y="35" width="150" height="145" rx="12" fill="#0a0a0a" />

        {/* Safe body */}
        <rect
          x="20"
          y="30"
          width="150"
          height="145"
          rx="12"
          fill={bgColor}
          stroke={isVulnerable ? '#FF5000' : '#2a2a2a'}
          strokeWidth="3"
        />

        {/* Safe door frame */}
        <rect
          x="30"
          y="40"
          width="130"
          height="125"
          rx="8"
          fill={isVulnerable ? '#151010' : '#0f0f0f'}
          stroke={isVulnerable ? '#FF500033' : '#1a1a1a'}
          strokeWidth="2"
        />

        {/* Inner vault area - where balance shows */}
        <rect
          x="40"
          y="50"
          width="110"
          height="70"
          rx="4"
          fill="#0a0a0a"
        />

        {/* Balance display area glow */}
        <rect
          x="42"
          y="52"
          width="106"
          height="66"
          rx="3"
          fill="none"
          stroke={accentColor}
          strokeWidth="1"
          opacity="0.3"
        />

        {/* Dial outer ring */}
        <circle
          cx="95"
          cy="145"
          r="22"
          fill="#0f0f0f"
          stroke={accentColor}
          strokeWidth="2"
        />

        {/* Dial inner ring */}
        <circle
          cx="95"
          cy="145"
          r="16"
          fill="#1a1a1a"
          stroke="#333"
          strokeWidth="1"
        />

        {/* Dial center */}
        <circle cx="95" cy="145" r="5" fill={accentColor} />

        {/* Dial tick marks */}
        {[...Array(8)].map((_, i) => {
          const angle = (i * 45) * Math.PI / 180;
          const x1 = 95 + Math.cos(angle) * 12;
          const y1 = 145 + Math.sin(angle) * 12;
          const x2 = 95 + Math.cos(angle) * 15;
          const y2 = 145 + Math.sin(angle) * 15;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#444"
              strokeWidth="1.5"
            />
          );
        })}

        {/* Dial pointer */}
        <motion.line
          x1="95"
          y1="145"
          x2="95"
          y2="132"
          stroke={accentColor}
          strokeWidth="2"
          strokeLinecap="round"
          animate={{ rotate: isBeingAttacked ? [0, 360] : 0 }}
          transition={{ duration: 2, repeat: isBeingAttacked ? Infinity : 0, ease: "linear" }}
          style={{ transformOrigin: '95px 145px' }}
        />

        {/* Handle */}
        <rect x="130" y="138" width="8" height="14" rx="2" fill="#333" stroke="#444" strokeWidth="1" />

        {/* Corner bolts */}
        <circle cx="35" cy="45" r="3" fill="#333" />
        <circle cx="155" cy="45" r="3" fill="#333" />
        <circle cx="35" cy="160" r="3" fill="#333" />
        <circle cx="155" cy="160" r="3" fill="#333" />

        {/* Glow effect when vulnerable */}
        {isVulnerable && (
          <motion.rect
            x="20"
            y="30"
            width="150"
            height="145"
            rx="12"
            fill="none"
            stroke="#FF5000"
            strokeWidth="2"
            opacity={0.4}
            animate={{ opacity: [0.4, 0.1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </svg>

      {/* Balance display inside safe */}
      {balance !== undefined && (
        <div
          className="absolute flex flex-col items-center justify-center pointer-events-none"
          style={{
            top: size * 0.25,
            left: size * 0.2,
            width: size * 0.6,
            height: size * 0.35,
          }}
        >
          <p className="text-text-dim text-[10px] uppercase tracking-wider mb-1">
            {isVulnerable ? 'At Risk' : 'Secured'}
          </p>
          <p
            className={`font-bold tracking-tight ${isVulnerable ? 'text-loss' : 'text-neon'}`}
            style={{ fontSize: size * 0.14 }}
          >
            ${formatBalance(balance)}
          </p>
        </div>
      )}
    </motion.div>
  );
};

// Smaller version for target safes in heist mode
export const TargetSafeGraphic = ({
  size = 80,
  difficulty = 'tricky',
  ownerName
}: {
  size?: number;
  difficulty?: 'soft' | 'tricky' | 'brutal';
  ownerName?: string;
}) => {
  const colors = {
    soft: '#00C805',
    tricky: '#FFB800',
    brutal: '#FF5000',
  };

  const color = colors[difficulty];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" width={size} height={size}>
        {/* Safe body */}
        <rect
          x="8"
          y="12"
          width="60"
          height="56"
          rx="6"
          fill="#121212"
          stroke={color}
          strokeWidth="2"
        />

        {/* Door */}
        <rect
          x="12"
          y="16"
          width="52"
          height="48"
          rx="4"
          fill="#0a0a0a"
        />

        {/* Dial */}
        <circle
          cx="38"
          cy="40"
          r="12"
          fill="#0f0f0f"
          stroke={color}
          strokeWidth="1.5"
        />
        <circle
          cx="38"
          cy="40"
          r="3"
          fill={color}
        />

        {/* Handle */}
        <rect
          x="54"
          y="35"
          width="4"
          height="10"
          rx="1"
          fill="#333"
        />
      </svg>
    </div>
  );
};
